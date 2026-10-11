import { describe, expect, it } from 'vitest';
import { marksIn, searchPage, searchSuggest, splitDate, type Catalog } from '@chassidushub/core';
import { add, freshCatalog, yudShvat } from './helpers.js';

/** How many statements a read takes. */
async function counted<T>(catalog: Catalog, read: () => Promise<T>): Promise<{ result: T; statements: number }> {
  let statements = 0;
  const query = catalog.db.query.bind(catalog.db);
  catalog.db.query = ((sql: string, params?: unknown[]) => (statements++, query(sql, params))) as typeof catalog.db.query;
  try {
    return { result: await read(), statements };
  } finally {
    catalog.db.query = query;
  }
}

/** A small catalog with made-up words (לדוגמה): a sefer of maamarim, a farbrengen with a recording and its transcript. */
async function sample() {
  const { catalog, set } = await freshCatalog();
  const author = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'הרבי' }, kind: 'rebbe', rebbe: 7 });
  const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'ספר המאמרים לדוגמה' }, slug: 'maamarim', authors: [author], genre: 'maamarim', levels: ['volume', 'maamar'], sets: [set] }, '/maamarim');
  const body = (...paragraphs: string[]) => ({ profile: 'plain', versions: [{ id: 'he', language: 'he', segments: paragraphs.map((p, i) => ({ id: `p${i + 1}`, kind: 'paragraph', text: [{ text: p }] })) }] });
  const maamar = (n: string, b: ReturnType<typeof body>, extra: Record<string, unknown> = {}) =>
    add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'volume', value: '1', label: { he: 'חלק א' } }, { level: 'maamar', value: n }], order: n, label: { he: `ד"ה מאמר ${n}` }, body: b, sets: [set], ...extra }, `/maamarim/1/${n}`);
  const opens = await maamar('1', body('פתח דבר לדוגמה. ועוד מלים', 'המשך'), { date: '5711-11-10' });
  const mentions = await maamar('2', body('פתיחה אחרת', 'וכמו שכתוב פתח דבר לדוגמה'), { date: '5742-05-10' });
  const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set), '/farbrengens/5742/yud-shvat');
  const recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
  const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
  const heard = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'מען דארף פתח דבר לדוגמה', proofread: 0, origin: { by: 'transcribe:fake@1' } });
  const alignment = await add(catalog, 'mendy', 'keeper', 'alignment', { recording, text, granularity: 'paragraph' });
  await add(catalog, 'mendy', 'keeper', 'alignment-span', { alignment, segment: heard, startMs: 754_000, endMs: 800_000 });
  return { catalog, set, work, maamar, body, opens, mentions, event, recording, heard };
}

describe('the search screen in one read', () => {
  it('takes a date out of the words: the longest run that reads as one, a lone number only as a year', () => {
    expect(splitDate('פתח דבר תשי"א')).toEqual({ date: '5711', rest: 'פתח דבר' });
    expect(splitDate('יו"ד שבט תשמ"ב')).toEqual({ date: '5742-05-10', rest: '' });
    expect(splitDate('לקוטי שיחות 12')).toEqual({ date: null, rest: 'לקוטי שיחות 12' });
    expect(splitDate('פתח דבר')).toEqual({ date: null, rest: 'פתח דבר' });
  });

  it('marks where the words are in a snippet', () => {
    expect(marksIn('וכמו שכתוב פתח דבר', ['פתח', 'דבר'])).toEqual([
      [11, 14],
      [15, 18],
    ]);
  });

  it('finds the sefer, the farbrengen and the words, each ready to draw, in at most six statements', async () => {
    const { catalog, work, opens, mentions, event, heard } = await sample();
    const { result: page, statements } = await counted(catalog, () => searchPage(catalog, 'פתח דבר לדוגמה'));
    expect(statements).toBeLessThanOrEqual(6);
    expect(page.date).toBeNull();
    expect(page.words.map((w) => w.id)).toEqual([opens, mentions, heard]);
    expect(page.words[0]).toMatchObject({ kind: 'paragraph', title: 'ד"ה מאמר 1', sub: 'ספר המאמרים לדוגמה · חלק א', path: '/maamarim/1/1#p1', opening: true, machine: false });
    expect(page.words[0]!.marks.length).toBe(3);
    // A transcript opens at its farbrengen, at the moment the words are heard, and says a machine heard them.
    expect(page.words[2]).toMatchObject({ title: 'יו״ד שבט תשמ״ב', path: '/farbrengens/5742/yud-shvat?t=754', machine: true });
    // The maamar that opens with the words is what was looked for.
    expect(page.top).toMatchObject({ id: opens, kind: 'maamar', read: true });
    expect(page.works.find((w) => w.id === work)).toBeUndefined();

    const sefer = (await searchPage(catalog, 'ספר המאמרים')).works[0];
    expect(sefer).toMatchObject({ id: work, type: 'work', kind: 'sefer', title: 'ספר המאמרים לדוגמה', sub: 'הרבי', path: '/maamarim' });
    expect((await searchPage(catalog, 'יו״ד שבט')).events[0]).toMatchObject({ id: event, kind: 'farbrengen', listen: true });
  });

  it('a year narrows the words; a date alone is that day, its farbrengen first, in one statement', async () => {
    const { catalog, opens, mentions, event } = await sample();
    const narrowed = await searchPage(catalog, 'פתח דבר לדוגמה תשי"א');
    expect(narrowed).toMatchObject({ date: { key: '5711' }, within: '5711' });
    expect(narrowed.words.map((w) => w.id)).toEqual([opens]);
    expect((await searchPage(catalog, 'פתח דבר לדוגמה', { within: '5742' })).words.map((w) => w.id)).toContain(mentions);

    const { result: day, statements } = await counted(catalog, () => searchPage(catalog, 'יו"ד שבט תשמ"ב'));
    expect(statements).toBe(1);
    expect(day).toMatchObject({ date: { key: '5742-05-10' }, words: [], works: [] });
    expect(day.top).toMatchObject({ id: event, kind: 'farbrengen', title: 'יו״ד שבט תשמ״ב', listen: true });
    expect(day.events.map((e) => e.id)).toEqual([event]);
  });

  it("a parsha's name alone is the farbrengens of its weeks; words that end in one stay words (#90)", async () => {
    const { catalog, maamar, body, event } = await sample();
    // 10 Shevat 5742 is in the week of Beshalach.
    const { result: week, statements } = await counted(catalog, () => searchPage(catalog, 'בשלח'));
    expect(statements).toBeLessThanOrEqual(6);
    expect(week.parsha).toEqual({ key: 'Beshalach', he: 'בשלח' });
    expect(week.events.map((e) => e.id)).toEqual([event]);
    expect(week.top).toMatchObject({ id: event, kind: 'farbrengen' });
    expect((await searchPage(catalog, 'פרשת בשלח תשמ"ב')).events.map((e) => e.id)).toEqual([event]);
    expect((await searchPage(catalog, 'Beshalah')).parsha?.key).toBe('Beshalach');
    expect((await searchPage(catalog, 'תצווה')).parsha?.key).toBe('Tetzaveh');
    // In Hebrew a letter apart is another word: a mitzvah is not Tetzaveh.
    expect((await searchPage(catalog, 'מצוה')).parsha).toBeNull();
    expect(await searchPage(catalog, 'בשלח תשמ"א')).toMatchObject({ parsha: { key: 'Beshalach' }, events: [] });
    expect(await searchPage(catalog, 'יתרו')).toMatchObject({ parsha: { key: 'Yitro' }, events: [] });

    // A maamar that opens with a parsha's name is looked for by its words, and comes first.
    const tetzaveh = await maamar('3', body('ואתה תצוה לדוגמה את בני ישראל'));
    const opening = await searchPage(catalog, 'ואתה תצוה');
    expect(opening.parsha).toBeNull();
    expect(opening.top).toMatchObject({ id: tetzaveh, kind: 'maamar' });
  });

  it('suggests names as someone types, up to six, in one statement', async () => {
    const { catalog, work } = await sample();
    const { result: hits, statements } = await counted(catalog, () => searchSuggest(catalog, 'ספר המאמ'));
    expect(statements).toBe(1);
    expect(hits[0]).toMatchObject({ id: work, kind: 'sefer', title: 'ספר המאמרים לדוגמה' });
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(await searchSuggest(catalog, '')).toEqual([]);
  });
});
