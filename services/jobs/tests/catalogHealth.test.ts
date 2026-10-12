import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogHealthCommand } from '../src/catalogHealthCommand.js';

/** `chassidushub catalog-health` over a snapshot kept in a folder, as the API serves it (docs/catalog-snapshot.md). */
describe('catalog-health', () => {
  it('reads the snapshot, takes each unit\'s kind from names.json, and writes the report with its change', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'health-'));
    await mkdir(join(dir, 'snap', 'files'), { recursive: true });
    const put = (file: string, value: unknown) => writeFile(join(dir, 'snap', 'files', file), JSON.stringify(value));
    await put('tree.0000000000000001.json', {
      format: 1,
      top: ['rh-rebbe'],
      sets: { 'rh-rebbe': { id: 'rh-rebbe', path: '/sets/the-rebbe', name: { he: 'הרבי' }, rebbe: 9, sets: [], works: ['rh-tanya'], additions: [] } },
      works: { 'rh-tanya': { id: 'rh-tanya', path: '/tanya', title: { he: 'תניא' }, sets: ['rh-rebbe'], additions: [], parts: [{ value: '', label: null, units: 2 }], units: 2 } },
    });
    await put('work-rh-tanya.0000000000000002.json', {
      format: 1, work: 'rh-tanya', depth: 1,
      parts: [{ value: '', label: null, units: 2, items: [{ id: 'rh-c1', path: '/tanya/1', title: { he: 'א' } }, { id: 'rh-c2', path: '/tanya/2', title: { he: 'ב"ה' } }] }],
    });
    await put('names.0000000000000003.json', { format: 1, names: [['chapter', 'א', null, 'תניא', '/tanya/1'], ['chapter', 'ב"ה', null, 'תניא', '/tanya/2']] });
    await writeFile(join(dir, 'snap', 'manifest.json'), JSON.stringify({
      format: 1, version: '7', seq: 7, base: '',
      tree: { file: 'tree.0000000000000001.json' },
      names: { file: 'names.0000000000000003.json' },
      works: { 'rh-tanya': { file: 'work-rh-tanya.0000000000000002.json', units: 2 } },
      years: {},
    }));
    await writeFile(join(dir, 'before.json'), JSON.stringify({ counts: { unlabelledUnits: 3 } }));

    const lines: string[] = [];
    await catalogHealthCommand({ log: (line) => lines.push(line) }, { from: join(dir, 'snap'), out: join(dir, 'out'), previous: join(dir, 'before.json') });
    const report = JSON.parse(await readFile(join(dir, 'out', 'report.json'), 'utf8'));
    // A chapter is rightly named by its number; ב"ה is no name even for a chapter.
    expect(report.counts).toMatchObject({ units: 2, unlabelledUnits: 1 });
    expect(report.snapshot.version).toBe('7');
    expect(await readFile(join(dir, 'out', 'report.md'), 'utf8')).toContain('| Units with no real label | 1 | -2 |');
    expect(lines).toContain('unlabelledUnits: 1');
  });
});
