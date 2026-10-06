import { describe, expect, it } from 'vitest';
import { describeScopeList, parseScopeList } from '../src/scope.js';
import { MIN_BUNDLE_BYTES, bundleWorks, resolveWorkSelection, resolveWorks, worksLabel } from '../src/works.js';

describe('several years in one pack', () => {
  it('reads a list of years or months, in order and without repeats', () => {
    expect(parseScopeList('5740-01, 5736-01,5736-01').map((s) => s.slug)).toEqual(['5736-01-tishrei', '5740-01-tishrei']);
    expect(() => parseScopeList(' , ')).toThrow();
    expect(() => parseScopeList('5736,57x')).toThrow();
  });

  it('names the list: the months and the run of years', () => {
    const one = describeScopeList(parseScopeList('5736-01'));
    expect(one.slug).toBe('5736-01-tishrei');
    const run = describeScopeList(parseScopeList('5736-01,5737-01,5738-01'));
    expect(run.scope).toMatchObject({ kind: 'custom', collection: 'farbrengens', label: { en: 'Tishrei 5736-5738' } });
    expect(run.scope.label.he).toBe('תשרי תשל״ו–תשל״ח');
    expect(run.slug).toBe('5736-5738-tishrei');
    expect(describeScopeList(parseScopeList('5736-01,5736-02')).slug).toBe('5736-tishrei-cheshvan');
    const scattered = describeScopeList(parseScopeList('5711,5736,5750'));
    expect(scattered.scope.label.en).toBe('5711, 5736, 5750');
    expect(scattered.slug).toBe('3-years-5711-5750');
  });
});

describe('seforim bundles', () => {
  const MB = 1024 * 1024;
  const authors = [
    { id: 'alter-rebbe', name: { he: 'אדמו"ר הזקן', en: 'the Alter Rebbe' } },
    { id: 'mitteler-rebbe', name: { he: 'אדמו"ר האמצעי', en: 'the Mitteler Rebbe' } },
    { id: 'the-rebbe', name: { he: 'הרבי', en: 'the Rebbe' } },
  ];
  const shelf = bundleWorks(
    [
      { id: 'tanya', title: { he: 'תניא', en: 'Tanya' }, author: 'alter-rebbe', bytes: 5 * MB, texts: 10 },
      { id: 'torah-or', title: { he: 'תורה אור', en: 'Torah Or' }, author: 'alter-rebbe', bytes: 7 * MB, texts: 20 },
      { id: 'ner-mitzvah', title: { he: 'נר מצוה', en: 'Ner Mitzvah' }, author: 'mitteler-rebbe', bytes: 1 * MB, texts: 5 },
      {
        id: 'igros',
        title: { he: 'אגרות קודש', en: 'Igros Kodesh' },
        author: 'the-rebbe',
        bytes: 55 * MB,
        texts: 100,
        parts: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: { he: `חלק ${n}`, en: `Volume ${n}` }, bytes: 10 * MB, texts: 20 })),
      },
      { id: 'maaneh', title: { he: 'מענה לשון', en: 'Maaneh Lashon' }, bytes: 0.25 * MB, texts: 7 },
    ],
    authors,
  );

  it('groups by author, and puts small or authorless seforim together', () => {
    expect(MIN_BUNDLE_BYTES).toBe(10 * MB);
    expect(shelf.bundles.map((b) => [b.id, b.works])).toEqual([
      ['alter-rebbe', ['tanya', 'torah-or']],
      ['the-rebbe', ['igros']],
      ['more', ['maaneh', 'ner-mitzvah']],
    ]);
    expect(shelf.bundles[0]!.label.he).toBe('ספרי אדמו"ר הזקן');
    expect(shelf.works.find((w) => w.id === 'ner-mitzvah')!.bundle).toBe('more');
  });

  it('resolves bundles, seforim and all, and names what was chosen', () => {
    expect(resolveWorks('alter-rebbe,igros', shelf)).toEqual(['tanya', 'torah-or', 'igros']);
    expect(resolveWorks('all', shelf)).toHaveLength(5);
    expect(() => resolveWorks('zohar', shelf)).toThrow(/no sefer or bundle/);
    expect(worksLabel(['tanya', 'torah-or', 'maaneh'], shelf).he).toBe('ספרי אדמו"ר הזקן, מענה לשון');
    expect(worksLabel(resolveWorks('all', shelf), shelf).he).toBe('כל הספרים');
  });
});

describe('a sefer in parts', () => {
  const MB = 1024 * 1024;
  const shelf = bundleWorks(
    [
      { id: 'tanya', title: { he: 'תניא', en: 'Tanya' }, author: 'alter-rebbe', bytes: 12 * MB, texts: 10 },
      {
        id: 'igros',
        title: { he: 'אגרות קודש', en: 'Igros Kodesh' },
        author: 'the-rebbe',
        bytes: 55 * MB,
        texts: 100,
        parts: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: { he: `חלק ${n}`, en: `Volume ${n}` }, bytes: 10 * MB, texts: 20 })),
      },
    ],
    [
      { id: 'alter-rebbe', name: { he: 'אדמו"ר הזקן', en: 'the Alter Rebbe' } },
      { id: 'mitteler-rebbe', name: { he: 'אדמו"ר האמצעי', en: 'the Mitteler Rebbe' } },
      { id: 'the-rebbe', name: { he: 'הרבי', en: 'the Rebbe' } },
    ],
  );

  it('lists the authors with seforim, and each sefer by its author with its parts', () => {
    expect(shelf.authors!.map((a) => a.id)).toEqual(['alter-rebbe', 'the-rebbe']);
    expect(shelf.works.find((w) => w.id === 'igros')).toMatchObject({ author: 'the-rebbe', parts: expect.arrayContaining([expect.objectContaining({ id: '3' })]) });
    expect(shelf.works.find((w) => w.id === 'tanya')!.parts).toBeUndefined();
  });

  it('takes some of its parts, the whole when all are picked, and never a part it lacks', () => {
    expect(resolveWorkSelection('igros:3,igros:1', shelf)).toEqual([{ id: 'igros', parts: ['1', '3'] }]);
    expect(resolveWorkSelection('igros:3,igros', shelf)).toEqual([{ id: 'igros', parts: null }]);
    expect(resolveWorkSelection('igros:1,igros:2,igros:3,igros:4,igros:5', shelf)).toEqual([{ id: 'igros', parts: null }]);
    expect(() => resolveWorkSelection('igros:9', shelf)).toThrow(/no part "9"/);
    expect(() => resolveWorkSelection('tanya:1', shelf)).toThrow(/no part/);
    expect(resolveWorks('tanya,igros:2', shelf)).toEqual(['tanya', 'igros']);
  });

  it('names the parts taken', () => {
    expect(worksLabel(resolveWorkSelection('igros:3,igros:4', shelf), shelf)).toEqual({ he: 'אגרות קודש · חלק 3, חלק 4', en: 'Igros Kodesh · Volume 3, Volume 4' });
    expect(worksLabel(resolveWorkSelection('igros:1,igros:2,igros:3,igros:4', shelf), shelf).en).toBe('Igros Kodesh · 4 parts');
    expect(worksLabel(resolveWorkSelection('tanya,igros:2', shelf), shelf).he).toBe('ספרי אדמו"ר הזקן, אגרות קודש · חלק 2');
  });
});
