import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogTree, getFile } from '@chassidushub/core';
import { loadSample } from '../src/sample.js';
import { freshCatalog } from '../../../packages/core/tests/helpers.js';

/**
 * The sample catalog for local work (`npm run sample`): the Rebbeim's
 * shelves with official sefarim and additions, volumes, a sefer with
 * words, a farbrengen with its recording and machine transcript, open
 * suggestions and a report, loaded once.
 */
describe('the sample catalog', () => {
  it('loads shelves, sefarim, a farbrengen with its transcript and open suggestions, once', async () => {
    const { catalog } = await freshCatalog();
    const files = await mkdtemp(join(tmpdir(), 'chassidushub-sample-'));
    try {
      const result = await loadSample(catalog, { account: 'dev', filesDir: files });
      expect(result.loaded).toBe(true);
      expect((await catalog.account('dev'))?.is_steward).toBe(true);

      const rebbe = (await catalog.resolvePath('/sets/the-rebbe'))!.id;
      const tree = await catalogTree(catalog, { root: rebbe, depth: 1 });
      expect(tree.children.filter((n) => n.type === 'set').map((n) => n.path)).toEqual(['/sets/the-rebbe-likkutei-sichos', '/sets/the-rebbe-maamarim']);
      const works = tree.children.filter((n) => n.type === 'work');
      expect(works.filter((n) => !n.addition).map((n) => n.path)).toEqual(expect.arrayContaining(['/hayom-yom', '/inyanah-shel-toras-hachassidus']));
      expect(works.filter((n) => n.addition).map((n) => n.path).sort()).toEqual(['/hayom-yom-biurim', '/sefer-hamafteichos']);

      const ls = (await catalog.resolvePath('/likkutei-sichos'))!.id;
      expect((await catalog.workOutline(ls)).map((v) => [v.value, v.units])).toEqual([['1', 3], ['2', 2], ['3', 1]]);

      const chapter = (await catalog.get((await catalog.resolvePath('/tanya/1/1'))!.id))!;
      expect(JSON.stringify(chapter.data)).toContain('לדוגמה');

      const event = (await catalog.resolvePath('/events/5742-05-10'))!.id;
      const [recording] = await catalog.children(event, 'event', 'recording');
      const audio = (recording!.data as { file: string }).file;
      expect((await getFile(catalog.db, audio))?.storage_tier).toBe('public');
      expect((await readFile(join(files, 'public', 'objects', audio))).subarray(0, 4).toString()).toBe('RIFF');
      const [text] = await catalog.children(recording!.id, 'recording', 'text');
      expect(await catalog.children(text!.id, 'text', 'segment')).toHaveLength(5);

      const open = await catalog.listChangesets({ status: 'open' });
      expect(open.map((c) => c.id).sort()).toEqual([...result.suggestions].sort());
      expect(result.suggestions).toHaveLength(3);

      expect((await loadSample(catalog, { account: 'dev', filesDir: files })).loaded).toBe(false);
    } finally {
      await rm(files, { recursive: true, force: true });
    }
  });
});
