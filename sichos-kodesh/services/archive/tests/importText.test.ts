import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importText, textUrl } from '../src/importText.js';
import type { TextRecord } from '../src/importText.js';
import { ArchiveStore } from '../src/store.js';

const sha = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
const MIME = 'text/html; charset=utf-8';
// Invented texts - no source text is in this repository.
const record = (itemId: string, text: string, ord: number): TextRecord => ({ collection: 'igros', itemId, text, mime: MIME, label: itemId.slice(6), hebrewYear: 5710, ord });
const options = { author: 'igros-import', message: 'test import' };

let root: string;
let store: ArchiveStore;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'sk-archive-text-'));
  store = await ArchiveStore.open(root);
});

afterAll(async () => {
  store.close();
  await rm(root, { recursive: true, force: true });
});

function refs(itemId: string): Array<{ sha256: string; removed: boolean }> {
  return (store.db.prepare("SELECT sha256, removed_commit FROM refs WHERE collection = 'igros' AND item_id = ? ORDER BY rowid").all(itemId) as Array<{ sha256: string; removed_commit: string | null }>).map(
    (row) => ({ sha256: row.sha256, removed: row.removed_commit !== null }),
  );
}

describe('importText', () => {
  it('counts on a dry run and writes nothing', async () => {
    const result = await importText(store, [record('igros:1', '<article>א</article>', 1)], { ...options, dryRun: true });
    expect(result).toEqual({ records: 1, added: 1, unchanged: 0, changed: 0, bytes: Buffer.byteLength('<article>א</article>'), commitId: null });
    expect(store.db.prepare('SELECT count(*) AS n FROM wanted').get()).toEqual({ n: 0 });
  });

  it('stores each text as an object by its hash, with a wanted row, a source and a ref', async () => {
    const result = await importText(store, [record('igros:1', '<article>א</article>', 1), record('igros:2', '<article>ב</article>', 2)], options);
    expect(result).toMatchObject({ records: 2, added: 2, unchanged: 0, changed: 0 });
    expect(result.commitId).not.toBeNull();
    const text = await readFile(store.objectPath(sha('<article>א</article>')), 'utf8');
    expect(text).toBe('<article>א</article>');
    expect(store.db.prepare('SELECT kind, mime FROM objects WHERE sha256 = ?').get(sha('<article>א</article>'))).toEqual({ kind: 'text', mime: MIME });
    expect(store.db.prepare("SELECT source, url, kind, source_id, label, ord, hebrew_year FROM wanted WHERE item_id = 'igros:1'").get()).toEqual({
      source: 'contribution',
      url: textUrl('igros', 'igros:1'),
      kind: 'text',
      source_id: 'igros:1',
      label: '1',
      ord: 1,
      hebrew_year: 5710,
    });
    expect(store.db.prepare("SELECT status, sha256 FROM sources WHERE source = 'contribution' AND url = ?").get(textUrl('igros', 'igros:2'))).toEqual({ status: 'ok', sha256: sha('<article>ב</article>') });
    expect(refs('igros:1')).toEqual([{ sha256: sha('<article>א</article>'), removed: false }]);
    const commit = store.db.prepare('SELECT author, status FROM commits WHERE id = ?').get(result.commitId!);
    expect(commit).toEqual({ author: 'igros-import', status: 'main' });
  });

  it('adds nothing when the same texts come again', async () => {
    const commits = (store.db.prepare('SELECT count(*) AS n FROM commits').get() as { n: number }).n;
    const result = await importText(store, [record('igros:1', '<article>א</article>', 1), record('igros:2', '<article>ב</article>', 2)], options);
    expect(result).toEqual({ records: 2, added: 0, unchanged: 2, changed: 0, bytes: 0, commitId: null });
    expect(store.db.prepare('SELECT count(*) AS n FROM commits').get()).toEqual({ n: commits });
  });

  it("moves an item's ref to its edited text, and back again", async () => {
    const edited = await importText(store, [record('igros:1', '<article>א - מתוקן</article>', 1)], options);
    expect(edited).toMatchObject({ added: 1, changed: 1, unchanged: 0 });
    expect(refs('igros:1')).toEqual([
      { sha256: sha('<article>א</article>'), removed: true },
      { sha256: sha('<article>א - מתוקן</article>'), removed: false },
    ]);
    const reverted = await importText(store, [record('igros:1', '<article>א</article>', 1)], options);
    expect(reverted).toMatchObject({ added: 0, changed: 1 });
    expect(refs('igros:1')).toEqual([
      { sha256: sha('<article>א</article>'), removed: false },
      { sha256: sha('<article>א - מתוקן</article>'), removed: true },
    ]);
  });
});
