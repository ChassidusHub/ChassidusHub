import { describe, expect, it } from 'vitest';
import { firstOutOfOrder, healthMarkdown, numberedName, snapshotHealth, startsWithBh, unlabelledReason, type HealthTree, type HealthWorkFile } from '@chassidushub/core';

/**
 * The nightly catalog health report, counted from a snapshot's tree.json
 * and work files (docs/catalog-snapshot.md), with no database.
 */

describe('a unit with no real label', () => {
  it('is named only ב"ה, a number, a date, a kind, its sefer or a file', () => {
    expect(unlabelledReason({ he: 'ב"ה' })).toBe('bh');
    expect(unlabelledReason({ he: 'בס״ד' })).toBe('bh');
    expect(unlabelledReason({ he: '192' })).toBe('number');
    expect(unlabelledReason({ he: 'קכ"ב' })).toBe('number');
    expect(unlabelledReason({ he: 'א, ב' })).toBe('number');
    expect(unlabelledReason({ he: "א'קכו" })).toBe('number');
    expect(unlabelledReason({ he: 'אגרת קכז' })).toBe('generic');
    expect(unlabelledReason({ he: 'י"ט כסלו תשכ"ב' })).toBe('date');
    expect(unlabelledReason({ he: "ה' טבת, ה'תשמ\"ז" })).toBe('date');
    expect(unlabelledReason({ he: 'שיחת י"ט כסלו תשכ"ב' })).toBeNull();
    expect(unlabelledReason({ he: 'פתח דבר' })).toBe('generic');
    expect(unlabelledReason({ he: 'תורת מנחם' }, 'תורת מנחם')).toBe('container');
    expect(unlabelledReason({ he: 'scan_0012.pdf' })).toBe('file');
    expect(unlabelledReason({ he: '/toras-menachem/3/4' })).toBe('none');
  });

  it('is not a sicha named for its parsha, a ד"ה, or a chapter named by its number', () => {
    expect(unlabelledReason({ he: 'נח' })).toBeNull();
    expect(unlabelledReason({ he: 'לך לך' })).toBeNull();
    expect(unlabelledReason({ he: 'בא' })).toBeNull();
    expect(unlabelledReason({ he: 'שבת' })).toBeNull();
    expect(unlabelledReason({ he: 'ד"ה באתי לגני' })).toBeNull();
    expect(unlabelledReason({ he: 'בס"ד. שיחת ש"פ בראשית' })).toBeNull();
    expect(unlabelledReason({ he: 'יב' }, undefined, null, 'chapter')).toBeNull();
    expect(unlabelledReason({ he: 'ב"ה' }, undefined, null, 'chapter')).toBe('bh');
  });

  it('a name with ב"ה in front is labelled, and counted apart for tidying', () => {
    expect(startsWithBh({ he: 'בס"ד. שיחת ש"פ בראשית' })).toBe(true);
    expect(startsWithBh({ he: 'ב"ה. נוסח המברק' })).toBe(true);
    expect(startsWithBh({ he: 'ב"ה' })).toBe(false);
    expect(startsWithBh({ he: 'בראשית' })).toBe(false);
  });
});

describe('order', () => {
  it('reads the number a name counts by', () => {
    expect(numberedName('חלק יב')).toEqual({ stem: 'חלק', n: [12] });
    expect(numberedName('ספר המאמרים תשמ"ב')).toEqual({ stem: 'ספר המאמרים', n: [5742] });
    expect(numberedName("ספר המאמרים ה'תש\"ד")?.n).toEqual([5704]);
    expect(numberedName('ה\'תשמ"ז, חלק ב')?.n).toEqual([5747, 2]);
    expect(numberedName('אגרות נוספים - לה\'\'ק 5712')?.n).toEqual([5712]);
    expect(numberedName('ליקוטי שיחות')).toBeNull();
    expect(numberedName("כ''ק אדמו''ר מהורש''ב")).toBeNull();
  });

  it('finds names alike but for their number listed out of order, and leaves other names be', () => {
    expect(firstOutOfOrder(['חלק א', 'חלק ג', 'חלק ב'])).toEqual({ before: 'חלק ג', after: 'חלק ב' });
    expect(firstOutOfOrder(['חלק א', 'חלק ב', 'מפתח', 'חלק ג'])).toBeNull();
    expect(firstOutOfOrder(['ה\'תשמ"ז, חלק ב', 'ה\'תשמ"ח, חלק א'])).toBeNull();
    expect(firstOutOfOrder(["כ''ק אדמו''ר מהורש''ב", "כ''ק אדמו''ר מהוריי''צ"])).toBeNull();
    // Two series on one shelf, each in order.
    expect(firstOutOfOrder(['ספר המאמרים תש"י', 'ספר המאמרים מלוקט ח"א', 'ספר המאמרים תשי"א', 'ספר המאמרים מלוקט ח"ב'])).toBeNull();
  });
});

const name = (he: string) => ({ he });

function catalog(): { tree: HealthTree; files: Map<string, HealthWorkFile> } {
  const tree: HealthTree = {
    top: ['rh-rebbe', 'rh-otzros', 'rh-empty'],
    sets: {
      'rh-rebbe': { id: 'rh-rebbe', path: '/sets/the-rebbe', name: name('הרבי'), rebbe: 9, sets: ['rh-years'], works: ['rh-tm', 'rh-sichos'], additions: [] },
      'rh-ff': { id: 'rh-ff', path: '/sets/frierdiker-rebbe', name: name('אדמו"ר הריי"צ'), rebbe: 8, sets: [], works: ['rh-sichos-ff'], additions: [] },
      'rh-years': { id: 'rh-years', path: '/sets/years', name: name('שנים'), parent: 'rh-rebbe', sets: [], works: ['rh-y2', 'rh-y1'], additions: [] },
      'rh-otzros': { id: 'rh-otzros', path: '/sets/otzros', name: name('אוצרות'), sets: [], works: [], additions: ['rh-tm-vols', 'rh-loose'] },
      'rh-empty': { id: 'rh-empty', path: '/sets/empty', name: name('ריק'), sets: [], works: [], additions: [] },
    },
    works: {
      'rh-tm': { id: 'rh-tm', path: '/toras-menachem', title: name('תורת מנחם'), sets: ['rh-rebbe'], additions: ['rh-tm-vols'], parts: [{ value: '1', label: name('כרך א'), units: 3 }, { value: '3', label: name('כרך ג'), units: 1 }, { value: '2', label: name('כרך ב'), units: 0 }], units: 4 },
      'rh-tm-vols': { id: 'rh-tm-vols', path: '/otzros/abc', title: name('תורת מנחם'), sets: ['rh-otzros'], addition: { kind: 'collection', to: 'rh-tm' }, additions: [], parts: [], units: 0 },
      'rh-loose': { id: 'rh-loose', path: '/otzros/def', title: name('שונות'), sets: ['rh-otzros'], addition: { kind: 'other' }, additions: [], parts: [], units: 0 },
      'rh-nowhere': { id: 'rh-nowhere', path: '/nowhere', title: name('ספר בלי מקום'), sets: [], additions: [], parts: [], units: 0 },
      'rh-sichos': { id: 'rh-sichos', path: '/sefer-hasichos-rebbe', title: name('ספר השיחות'), sets: ['rh-rebbe'], additions: [], parts: [], units: 0 },
      'rh-sichos-ff': { id: 'rh-sichos-ff', path: '/sefer-hasichos-frierdiker-rebbe', title: name('ספר השיחות'), sets: ['rh-ff'], additions: [], parts: [], units: 0 },
      'rh-y1': { id: 'rh-y1', path: '/y1', title: name('ספר המאמרים תש"י'), sets: ['rh-years'], additions: [], parts: [], units: 0 },
      'rh-y2': { id: 'rh-y2', path: '/y2', title: name('ספר המאמרים תשי"א'), sets: ['rh-years'], additions: [], parts: [], units: 0 },
    },
  };
  const unit = (id: string, he: string) => ({ id: `rh-${id}` as const, path: `/toras-menachem/${id}`, title: name(he) });
  const files = new Map<string, HealthWorkFile>([
    ['rh-tm', { work: 'rh-tm', parts: [{ value: '1', label: name('כרך א'), items: [unit('u1', 'ב"ה'), unit('u2', 'בס"ד. שיחת ש"פ בראשית'), unit('u3', 'כרך א')] }, { value: '3', label: name('כרך ג'), items: [unit('u4', 'ד"ה באתי לגני')] }] }],
  ]);
  return { tree, files };
}

describe('the report', () => {
  it('counts each kind of problem, with the items behind it', async () => {
    const { tree, files } = catalog();
    const report = await snapshotHealth({ version: '42' }, tree, async (id) => files.get(id) ?? null, { now: new Date('2026-10-12T05:00:00Z') });
    expect(report.counts).toMatchObject({
      shelves: 5,
      sefarim: 8,
      units: 4,
      unlabelledUnits: 2,
      unitsStartingWithBh: 1,
      sefarimWithNoPlace: 1,
      topShelvesNotARebbe: 2,
      emptyShelves: 1,
      additionsWithoutSefer: 1,
      duplicateGroups: 1,
      duplicateSefarim: 2,
      shelvesOutOfOrder: 1,
      sefarimVolumesOutOfOrder: 1,
    });
    expect(report.unlabelled.byReason).toMatchObject({ bh: 1, container: 1 });
    expect(report.unlabelled.bySefer[0]).toMatchObject({ path: '/toras-menachem', unlabelled: 2, units: 4 });
    expect(report.noPlace.works.map((w) => w.path)).toEqual(['/nowhere']);
    expect(report.additionsWithoutSefer.map((w) => w.path)).toEqual(['/otzros/def']);
    // תורת מנחם twice is one sefer to merge; ספר השיחות on two Rebbeim's shelves is two sefarim.
    expect(report.duplicates).toEqual([expect.objectContaining({ name: 'תורת מנחם' })]);
    expect(report.outOfOrder.shelves).toEqual([expect.objectContaining({ path: '/sets/years', before: 'ספר המאמרים תשי"א', after: 'ספר המאמרים תש"י' })]);
    expect(report.outOfOrder.volumes).toEqual([expect.objectContaining({ path: '/toras-menachem', before: 'כרך ג', after: 'כרך ב' })]);

    const md = healthMarkdown(report, { previous: { ...report.counts, unlabelledUnits: 5 } });
    expect(md).toContain('| Units with no real label | 2 | -3 |');
    expect(md).toContain('[ספר בלי מקום](https://chassidushub.org/nowhere)');
  });
});
