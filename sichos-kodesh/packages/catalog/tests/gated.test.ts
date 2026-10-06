import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertShippable, buildGatedLibrary, GATED_COLLECTION_IDS, isShippable, parseCatalogLibrary, SHIPPABLE_COLLECTIONS } from '../src/index.js';
import type { IgrosLetterInput, MaanehInput } from '../src/index.js';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Invented records: no text from the source is in this repository.
const letters: IgrosLetterInput[] = [
  { id: 'igros:1', number: 1, suffix: '', numberLabel: 'א', volume: 1, bookPage: 'ג', dateLine: 'ב"ה, א\' ניסן, תש"ט', hebrewYear: 5709, city: 'עיר', summary: 'תקציר' },
  { id: 'igros:141a', number: 141, suffix: 'a', numberLabel: 'קמא*', volume: 1, bookPage: null, dateLine: '', hebrewYear: null, city: '', summary: '' },
  { id: 'igros:400', number: 400, suffix: '', numberLabel: 'ת', volume: 2, bookPage: null, dateLine: 'ב"ה, תש"י', hebrewYear: 5710, city: '', summary: '' },
];
const maanos: MaanehInput[] = [{ id: 'maanos:5742:1', year: 5742, number: 1, numberLabel: 'א', dateLine: '[תשרי]' }];

describe('the rights gate', () => {
  it('ships every indexed collection and the Igros, and holds back the Maanos', () => {
    expect(GATED_COLLECTION_IDS).toEqual(['igros', 'maanos']);
    expect(SHIPPABLE_COLLECTIONS.igros).toBe(true);
    expect(SHIPPABLE_COLLECTIONS.maanos).toBe(false);
    expect(isShippable('maamorim')).toBe(true);
    expect(isShippable('farbrengens')).toBe(true);
    expect(isShippable('igros')).toBe(true);
    expect(isShippable('maanos')).toBe(false);
    expect(isShippable('something-new')).toBe(false);
    expect(() => assertShippable(['maamorim', 'likkuteiSichos', 'igros'], 'x')).not.toThrow();
    expect(() => assertShippable(['maamorim', 'igros', 'maanos', 'maanos'], 'the release')).toThrow('the release: maanos may not ship');
  });
});

describe('buildGatedLibrary', () => {
  const gated = buildGatedLibrary(letters, maanos);

  it('makes one item per letter and maaneh, each with its text object as the one ref', () => {
    expect(gated.igros.items[0]).toEqual({
      id: 'igros:1',
      label: 'א - ב"ה, א\' ניסן, תש"ט',
      volume: 1,
      number: 1,
      suffix: '',
      numberLabel: 'א',
      dateLine: 'ב"ה, א\' ניסן, תש"ט',
      hebrewYear: 5709,
      bookPage: 'ג',
      city: 'עיר',
      summary: 'תקציר',
      refs: [{ kind: 'text', sourceId: 'igros:1' }],
    });
    expect(gated.igros.items[1]).toEqual({ id: 'igros:141a', label: 'קמא*', volume: 1, number: 141, suffix: 'a', numberLabel: 'קמא*', dateLine: '', refs: [{ kind: 'text', sourceId: 'igros:141a' }] });
    expect(gated.maanos.items).toEqual([{ id: 'maanos:5742:1', label: 'א - [תשרי]', hebrewYear: 5742, number: 1, numberLabel: 'א', dateLine: '[תשרי]', refs: [{ kind: 'text', sourceId: 'maanos:5742:1' }] }]);
  });

  it('groups the letters by volume and year, and the maanos by year', () => {
    expect(gated.igros.groups.volume).toEqual([
      { slug: '1', name: 'חלק א׳', itemIds: ['igros:1', 'igros:141a'] },
      { slug: '2', name: 'חלק ב׳', itemIds: ['igros:400'] },
    ]);
    expect(gated.igros.groups.year?.map((g) => [g.slug, g.itemIds])).toEqual([
      ['5709', ['igros:1']],
      ['5710', ['igros:400']],
    ]);
    expect(gated.maanos.groups.year?.map((g) => g.slug)).toEqual(['5742']);
  });

  it('is refused inside a library an app would take', () => {
    const empty = { items: [], groups: {} };
    const library = {
      moadim: [],
      parshiyos: [],
      collections: { likkuteiSichos: empty, maamorim: empty, yomanim: empty, hadranim: empty, michtavimKlolim: empty, reshimos: empty, jemEvents: empty },
    };
    expect(parseCatalogLibrary(library)).not.toBeNull();
    expect(parseCatalogLibrary({ ...library, collections: { ...library.collections, igros: gated.igros } })).toBeNull();
  });
});

describe('release-files', () => {
  it('refuses a library folder that holds a gated collection', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'catalog-gated-'));
    try {
      const libraryDir = path.join(dir, 'library');
      await import('node:fs/promises').then((fs) => fs.mkdir(libraryDir));
      writeFileSync(path.join(libraryDir, 'meta.json'), JSON.stringify({ moadim: [], parshiyos: [] }));
      writeFileSync(path.join(libraryDir, 'maanos.json'), JSON.stringify(buildGatedLibrary(letters, maanos).maanos));
      const run = promisify(execFile)(process.execPath, ['--import', 'tsx', 'bin/release.ts', '--library', libraryDir, '--out', path.join(dir, 'out')], { cwd: packageDir });
      await expect(run).rejects.toMatchObject({ stderr: expect.stringContaining('maanos may not ship') });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
