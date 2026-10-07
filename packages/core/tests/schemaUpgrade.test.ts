import { describe, expect, it } from 'vitest';
import { BUILTIN_SCHEMAS, BUILTIN_SCHEMA_VERSION } from '@chassidushub/model';
import { freshCatalog } from './helpers.js';

describe('built-in schema upgrades', () => {
  it('brings an older catalog up to the built-in schemas once, as one system change', async () => {
    const { catalog } = await freshCatalog();
    const head = await catalog.head();
    await catalog.init();
    expect(await catalog.head()).toBe(head); // up to date: nothing to do

    // A catalog made before this version: its schema items say so.
    await catalog.db.query(`UPDATE revision SET data = jsonb_set(data, '{version}', '1'), hash = 'old-' || hash WHERE entity_type = 'schema'`);
    await catalog.init();
    expect(await catalog.head()).toBe(head + 1);
    const [latest] = await catalog.commitsSince(head, 1);
    expect(latest).toMatchObject({ message: `Built-in schemas, version ${BUILTIN_SCHEMA_VERSION}`, author: 'system' });
    await catalog.init();
    expect(await catalog.head()).toBe(head + 1);
  });

  it('upgrades schema items a catalog brought over from another install keeps under other ids', async () => {
    const { catalog } = await freshCatalog();
    const head = await catalog.head();
    // Their ids came from another install's seed: give every schema item another id, as such a catalog has.
    await catalog.db.query(`SET session_replication_role = replica`);
    for (const table of ['revision', 'commit_change', 'entity']) {
      const column = table === 'entity' ? 'id' : 'entity_id';
      const has = await catalog.db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, column]);
      if (has.rows.length) await catalog.db.query(`UPDATE ${table} SET ${column} = ${column} || 'x' WHERE ${column} IN (SELECT id FROM entity WHERE type = 'schema')`);
    }
    await catalog.db.query(`SET session_replication_role = DEFAULT`);
    await catalog.db.query(`UPDATE revision SET data = jsonb_set(data, '{version}', '1'), hash = 'old-' || hash WHERE entity_type = 'schema'`);
    await catalog.init();
    expect(await catalog.head()).toBe(head + 1);
    const { rows } = await catalog.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM entity WHERE type = 'schema' AND NOT deleted`);
    expect(rows[0]!.n).toBe(Object.keys(BUILTIN_SCHEMAS).length);
  });
});
