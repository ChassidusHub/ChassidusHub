import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrate } from '@chassidushub/db';
import { openPGlite } from '@chassidushub/db/pglite';

describe('migrations', () => {
  it('create the catalog schema once, and are idempotent', async () => {
    const db = await openPGlite();
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await migrate(db)).toEqual([]);
    // Sign-in is kept apart from the catalog (migrations 0003 to 0005).
    const auth = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth' ORDER BY table_name");
    expect(auth.rows.map((r) => r.table_name)).toEqual(['api_token', 'challenge', 'draft', 'email_address', 'email_link', 'google_account', 'notification', 'notification_setting', 'oauth_client', 'oauth_connection', 'oauth_request', 'passkey', 'person', 'reading_place', 'session', 'username_redirect']);
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE 'revision_%' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'account',
      'archive_gap',
      'audit_log',
      'catalog_edition',
      'changeset',
      'changeset_advice',
      'comment',
      'commit',
      'commit_change',
      'cover',
      'derivation',
      'drive_file',
      'embedding',
      'entity',
      'entity_external_id',
      'entity_forward',
      'entity_ref',
      'family_request',
      'file',
      'file_fingerprint',
      'file_page',
      'file_source',
      'follow',
      'label',
      'link_check',
      'machine_pass',
      'machine_request',
      'mention',
      'page_fix',
      'path_redirect',
      'project',
      'project_claim',
      'project_head',
      'report',
      'report_assignee',
      'report_label',
      'review',
      'review_request',
      'revision',
      'schema_migration',
      'takedown',
      'thread_event',
      'thread_link',
      'unit_place',
      'webhook',
    ]);
    await db.close();
  });

  it('turn off compiling queries for every new connection (migration 0031)', async () => {
    const db = await openPGlite();
    await migrate(db);
    const { rows } = await db.query<{ setconfig: string[] }>(
      'SELECT setconfig FROM pg_db_role_setting WHERE setrole = 0 AND setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())',
    );
    expect(rows[0]?.setconfig).toContain('jit=off');
    await db.close();
  });

  it("keeps a unit's id in unit_place in entity's collation, so a plain join uses the key (migration 0036)", async () => {
    const db = await openPGlite();
    await migrate(db);
    const { rows } = await db.query<{ same: boolean }>(
      `SELECT (SELECT attcollation FROM pg_attribute WHERE attrelid = 'unit_place'::regclass AND attname = 'unit_id')
            = (SELECT attcollation FROM pg_attribute WHERE attrelid = 'entity'::regclass AND attname = 'id') AS same`,
    );
    // While they differed, a join that named neither compared in unit_place's collation and read every row of entity.
    expect(rows[0]?.same).toBe(true);
    await db.close();
  });

  it("indexes a sefer's units by volume, so its volumes are counted from the index (migration 0037)", async () => {
    const db = await openPGlite();
    await migrate(db);
    const { rows } = await db.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE tablename = 'unit_place' AND indexname = 'unit_place_part'");
    expect(rows[0]?.indexdef).toMatch(/\(work_id, part, ord, unit_id\)$/);
    await db.close();
  });

  it("keeps a suggestion's client key once for each author, so a retried send finds the first (migration 0038)", async () => {
    const db = await openPGlite();
    await migrate(db);
    await db.exec("INSERT INTO account (id, display_name) VALUES ('u-a', 'A'), ('u-b', 'B')");
    await db.exec("INSERT INTO changeset (title, author, client_key) VALUES ('One', 'u-a', 'k1'), ('Same key, someone else', 'u-b', 'k1'), ('No key', 'u-a', NULL), ('No key', 'u-a', NULL)");
    await expect(db.exec("INSERT INTO changeset (title, author, client_key) VALUES ('Again', 'u-a', 'k1')")).rejects.toThrow();
    await db.close();
  });

  it("indexes the words of pages, paragraphs and sichos each apart, over their live rows only (migration 0039)", async () => {
    const db = await openPGlite();
    await migrate(db);
    const { rows } = await db.query<{ indexname: string; indexdef: string }>("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'entity' AND indexname LIKE 'entity_tsv_%' ORDER BY indexname");
    expect(rows.map((r) => r.indexname)).toEqual(['entity_tsv_page', 'entity_tsv_segment', 'entity_tsv_unit']);
    for (const { indexdef } of rows) expect(indexdef).toMatch(/USING gin \(search_tsv\) WHERE .*NOT deleted.*main_rev IS NOT NULL/);
    await db.close();
  });

  it('tries a migration again when it gave up waiting for a lock, and gives up after its tries', async () => {
    const db = await openPGlite();
    await migrate(db);
    const last = MIGRATIONS.at(-1)!;
    await db.exec(`DELETE FROM schema_migration WHERE version = ${last.version}`);
    // A read held the table: the first two tries give up on the lock, as lock_timeout makes them.
    let refused = 2;
    const busy = (code: string) =>
      Object.assign(Object.create(db) as typeof db, {
        transaction: <T>(work: (tx: typeof db) => Promise<T>) => (refused-- > 0 ? Promise.reject(Object.assign(new Error('canceling statement due to lock timeout'), { code })) : db.transaction(work)),
      });
    const said: string[] = [];
    // The migration is already in the tables, so the try that gets through only writes its row.
    const realUp = last.up;
    (last as { up: string }).up = 'SELECT 1';
    try {
      expect(await migrate(busy('55P03'), { lockPauseMs: 1, log: (line) => said.push(line) })).toEqual([last.version]);
      expect(said).toHaveLength(2);
      await db.exec(`DELETE FROM schema_migration WHERE version = ${last.version}`);
      refused = 5;
      await expect(migrate(busy('55P03'), { lockTries: 3, lockPauseMs: 1 })).rejects.toThrow('lock timeout');
      // Any other error is not tried again.
      refused = 1;
      await expect(migrate(busy('42P01'), { lockPauseMs: 1 })).rejects.toThrow();
      expect(refused).toBe(0);
    } finally {
      (last as { up: string }).up = realUp;
      await db.close();
    }
  });

  it('rolls a failed transaction back', async () => {
    const db = await openPGlite();
    await migrate(db);
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO account (id, display_name) VALUES ('a', 'A')");
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    const { rows } = await db.query("SELECT id FROM account WHERE id = 'a'");
    expect(rows).toEqual([]);
    await db.close();
  });

  it('gives everyone a handle and every suggestion and report a number, once (migration 0016)', async () => {
    const db = await openPGlite();
    // The database as it was before: people, a suggestion, an import and a report.
    for (const m of MIGRATIONS.filter((m) => m.version < 16)) await db.exec(m.up);
    await db.exec(`INSERT INTO auth.person (id, display_name) VALUES
      ('u-aaaaaaaaaa', 'מנחם מענדל'), ('u-bbbbbbbbbb', 'Mendy Cohen'), ('u-cccccccccc', 'mendy cohen'), ('u-dddddddddd', 'Admin'), ('u-eeeeeeeeee', '!!')`);
    await db.exec("INSERT INTO account (id, display_name) VALUES ('u-bbbbbbbbbb', 'Mendy Cohen')");
    await db.exec("INSERT INTO changeset (title, author, kind) VALUES ('An import', 'system', 'import'), ('A fix', 'u-bbbbbbbbbb', 'suggestion')");
    await db.exec("INSERT INTO report (reason, note) VALUES ('other', 'sent when reports were private')");
    await db.transaction((tx) => tx.exec(MIGRATIONS.find((m) => m.version === 16)!.up));

    const people = await db.query<{ id: string; username: string }>('SELECT id, username FROM auth.person ORDER BY id');
    expect(people.rows.map((r) => r.username)).toEqual(['mnchm-mandl', 'mendy-cohen', 'mendy-cohen-cccccccccc', 'reader-dddddddddd', 'reader-eeeeeeeeee']);
    expect((await db.query('SELECT kind, number FROM changeset ORDER BY id')).rows).toEqual([{ kind: 'import', number: null }, { kind: 'suggestion', number: 1 }]);
    expect((await db.query('SELECT number, private FROM report')).rows).toEqual([{ number: 2, private: true }]);

    // From then on: the next number, whichever kind; a person made without a handle is given one.
    await db.exec("INSERT INTO report (reason) VALUES ('other'); INSERT INTO changeset (title, author) VALUES ('Another', 'system'); INSERT INTO auth.person (id, display_name) VALUES ('u-ffffffffff', 'x')");
    expect((await db.query("SELECT number FROM report WHERE note IS NULL")).rows).toEqual([{ number: 3 }]);
    expect((await db.query("SELECT number FROM changeset WHERE title = 'Another'")).rows).toEqual([{ number: 4 }]);
    expect((await db.query("SELECT username FROM auth.person WHERE id = 'u-ffffffffff'")).rows).toEqual([{ username: 'reader-ffffffffff' }]);
    // Handles are unique whatever their case.
    await expect(db.exec("UPDATE auth.person SET username = 'MENDY-COHEN' WHERE id = 'u-aaaaaaaaaa'")).rejects.toThrow();
    await db.close();
  });
});
