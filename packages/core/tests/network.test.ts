import { describe, expect, it } from 'vitest';
import { pageTextPlain, plainPage } from '@chassidushub/model';
import {
  EMBEDDING_DIMENSIONS,
  bestLine,
  catalogHealth,
  embedItems,
  embeddingInput,
  findCitations,
  proposeCitations,
  registerFile,
  relationsOf,
  searchMoments,
  MOMENT_CANDIDATES,
  searchSimilar,
  snippetOf,
  type Embedder,
} from '@chassidushub/core';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog, yudShvat } from './helpers.js';

/** Plain words as a page's body, as the catalog takes data. */
const page = (text: string) => JSON.parse(JSON.stringify(plainPage(text)));

describe('citations in text', () => {
  it('reads sefarim by volume, page and letter, however they are written', () => {
    const found = findCitations('ראה לקו"ש חי"ב עמ\' 123. ועיין אג״ק ח״ג אגרת תשסד, ובלקוטי שיחות חלק כה.');
    expect(found.map((c) => [c.kind, c.target])).toEqual([
      ['cites', { work: 'likkutei-sichos', volume: 12, page: 123, letter: undefined }],
      ['cites', { work: 'igros-kodesh-rebbe', volume: 3, page: undefined, letter: 764 }],
      ['cites', { work: 'likkutei-sichos', volume: 25, page: undefined, letter: undefined }],
    ]);
    expect(found[0]!.text).toBe('לקו"ש חי"ב עמ\' 123');
    expect(found[2]!.text).toBe('לקוטי שיחות חלק כה');
  });

  it('knows where a thing was printed, and the farbrengen it is based on', () => {
    const found = findCitations('נדפס בלקו״ש ח״ב עמ׳ 500. (משיחת יו״ד שבט תשמ״ב). וכן בשיחת י״ט כסלו תשל״ד');
    expect(found.map((c) => [c.kind, c.target])).toEqual([
      ['printed-in', { work: 'likkutei-sichos', volume: 2, page: 500, letter: undefined }],
      ['based-on', { date: '5742-05-10' }],
      ['cites', { date: '5734-03-19' }],
    ]);
    expect(findCitations('אג"ק אדמו"ר מהוריי"צ ח"ד')[0]!.target).toMatchObject({ work: 'igros-kodesh-frierdiker-rebbe', volume: 4 });
    expect(findCitations('שיחה בלי תאריך, ולקו"ש בלי חלק')).toEqual([]);
  });

  it('proposes the links it finds as a suggestion by the bot, once, and each page shows them', async () => {
    const { catalog, set } = await freshCatalog();
    const author = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'הרבי' }, kind: 'rebbe', rebbe: 7, sets: [set] });
    const ls = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'לקוטי שיחות' }, slug: 'likkutei-sichos', authors: [author], genre: 'sichos', levels: ['volume', 'sicha'], sets: [set] });
    const volume12 = await add(catalog, 'mendy', 'keeper', 'publication', { kind: 'book-volume', title: { he: 'לקוטי שיחות חלק יב' }, work: ls, volume: 'יב', sets: [set] });
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const sicha = await add(catalog, 'mendy', 'keeper', 'unit', {
      work: ls,
      position: [{ level: 'volume', value: '20' }, { level: 'sicha', value: '1' }],
      order: 'V',
      label: { he: 'בא א' },
      body: page('משיחת יו"ד שבט תשמ"ב. ראה לקו"ש חי"ב עמ\' 5, ולקו"ש חט"ו.'),
      sets: [set],
    });

    const first = await proposeCitations(catalog);
    expect(first).toMatchObject({ found: 3, proposed: 3 });
    const [suggestion] = await catalog.listChangesets({ author: 'bot:citations' });
    expect(suggestion).toMatchObject({ status: 'open' });
    // Nothing shows until a keeper approves.
    expect(await relationsOf(catalog, sicha)).toEqual([]);

    await catalog.merge(first.suggestions[0]!, 'keeper');
    const links = await relationsOf(catalog, sicha);
    expect(links.map((l) => [l.kind, l.direction, l.other, l.machine]).sort()).toEqual(
      [
        ['based-on', 'out', event, true],
        ['cites', 'out', ls, true],
        ['cites', 'out', volume12, true],
      ].sort(),
    );
    expect(await relationsOf(catalog, volume12)).toMatchObject([{ kind: 'cites', direction: 'in', other: sicha, note: 'לקו"ש חי"ב עמ\' 5' }]);

    // Read once: a second run finds nothing new, and a changed page is read again without proposing the same links.
    expect(await proposeCitations(catalog)).toMatchObject({ read: 0, proposed: 0 });
    const cs = await catalog.createChangeset('mendy', { title: 'עריכה' });
    const current = (await catalog.get(sicha))!;
    await catalog.putRevision(cs.id, 'mendy', { id: sicha, type: 'unit', data: { ...(current.data as object), body: page(`${pageTextPlain((current.data as { body: unknown }).body)} ועוד.`) } });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    expect(await proposeCitations(catalog)).toMatchObject({ read: 1, found: 3, proposed: 0 });
  });
});

describe('search that lands on the moment', () => {
  it('finds the best line on a page, and the words around a match', () => {
    const lines = [
      { id: 'l1', text: 'בס״ד' },
      { id: 'l2', text: 'ענין הגאולה' },
      { id: 'l3', text: 'ענין הגאולה והשלימות' },
    ];
    expect(bestLine(lines, ['גאולה', 'שלימות'])).toBeNull();
    expect(bestLine(lines, ['הגאול', 'והשלימות'])).toEqual({ line: lines[2], hits: ['הגאולה', 'והשלימות'] });
    const long = Array.from({ length: 100 }, (_, i) => (i === 60 ? 'אחדות' : `מלה${i}`)).join(' ');
    expect(snippetOf(long, ['אחדות'])).toMatch(/^… .*אחדות.* …$/);
  });

  it('opens a scan at the line, and a recording at the moment it is heard', async () => {
    const { catalog, set } = await freshCatalog();
    await registerFile(catalog.db, { sha256: 'a'.repeat(64), bytes: 10, mime: 'application/pdf', source: 'contribution', licence: 'cc0', held: true });
    const publication = await add(catalog, 'mendy', 'keeper', 'publication', { kind: 'book-volume', title: { he: 'כרך' }, sets: [set] });
    const scan = await add(catalog, 'mendy', 'keeper', 'scan', { publication, file: 'a'.repeat(64), completeness: 'complete', sets: [set] });
    const layer = await add(catalog, 'mendy', 'keeper', 'text-layer', { scan, kind: 'machine-ocr', engine: { name: 'fake', version: '1' } });
    await add(catalog, 'mendy', 'keeper', 'text-page', {
      layer,
      page: 7,
      proofread: 0,
      lines: [
        { id: 'l1', text: 'בס״ד' },
        { id: 'l2', text: 'ענין אהבת ישראל' },
      ],
    });
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
    const segment = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'מען דארף האבן אהבת ישראל צו יעדן', proofread: 0, origin: { by: 'transcribe:fake@1' } });
    const alignment = await add(catalog, 'mendy', 'keeper', 'alignment', { recording, text, granularity: 'paragraph' });
    await add(catalog, 'mendy', 'keeper', 'alignment-span', { alignment, segment, startMs: 754_000, endMs: 800_000 });

    // The rows found and whether their words may be shown are three statements, however many texts and scans they are of.
    let statements = 0;
    const query = catalog.db.query.bind(catalog.db);
    catalog.db.query = ((sql: string, params?: unknown[]) => (statements++, query(sql, params))) as typeof catalog.db.query;
    const moments = await searchMoments(catalog, 'אהבת ישראל');
    catalog.db.query = query;
    expect(statements).toBeLessThanOrEqual(3);
    expect(moments).toHaveLength(2);
    expect(moments.find((m) => m.kind === 'scan-line')).toMatchObject({ scan, publication, page: 7, line: { id: 'l2' }, hits: ['אהבת', 'ישראל'], machine: true });
    expect(moments.find((m) => m.kind === 'paragraph')).toMatchObject({ id: segment, recording, event, startMs: 754_000, textKind: 'transcript', machine: true });
  });

  it("finds a sefer's own words, a maamar that opens with them first, and checked words before a machine's (#88, #90)", async () => {
    const { catalog, set } = await freshCatalog();
    const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'מאמרים' }, slug: 'maamarim', authors: [], genre: 'maamarim', levels: ['maamar'], sets: [set] });
    const body = (...paragraphs: string[]) => ({ profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'h1', kind: 'heading', text: [{ text: 'כותרת לדוגמה' }] }, ...paragraphs.map((p, i) => ({ id: `p${i + 1}`, kind: 'paragraph', text: [{ text: p }] }))] }] });
    const maamar = (n: string, b: ReturnType<typeof body>, extra: Record<string, unknown> = {}) => add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'maamar', value: n }], order: n, label: { he: `מאמר ${n}` }, body: b, sets: [set], ...extra }, `/maamarim/${n}`);
    const mentions = await maamar('1', body('פתיחה אחרת לגמרי', 'וכמו שכתוב פתח דבר לדוגמה בענין זה'));
    const opens = await maamar('2', body('פתח דבר לדוגמה. ועוד מלים', 'המשך'));
    await maamar('3', body('פתח דבר לדוגמה גם כאן'), { bodySource: { source: 'chabadlibrary', rights: 'link', licence: 'site-terms' } });
    const text = await add(catalog, 'steward', 'steward', 'text', { kind: 'transcript', language: 'yi' });
    await add(catalog, 'steward', 'steward', 'segment', { text, order: 'V', kind: 'paragraph', content: 'פתח דבר לדוגמה', proofread: 0, origin: { by: 'transcribe:fake@1' } });

    const moments = await searchMoments(catalog, 'פתח דבר לדוגמה');
    expect(moments.map((m) => [m.kind === 'paragraph' && m.textKind, m.id === opens || m.id === mentions ? m.id : '-'])).toEqual([
      ['body', opens],
      ['body', mentions],
      ['transcript', '-'],
    ]);
    expect(moments[0]).toMatchObject({ unit: opens, path: '/maamarim/2', segment: 'p1', opening: true, machine: false, name: { he: 'מאמר 2' } });
    expect(moments[1]).toMatchObject({ segment: 'p2', opening: false });
  });

  it('picks its candidates by rank from the index alone, so the best match is found among many (#124)', async () => {
    const { catalog } = await freshCatalog();
    const text = await add(catalog, 'steward', 'steward', 'text', { kind: 'transcript', language: 'yi' });
    // More matches than are read: each says the words once among many others; one says just them.
    const cs = await catalog.createChangeset('steward', { title: 'Add segments' });
    const filler = Array.from({ length: 40 }, (_, i) => `מלה${i}`).join(' ');
    for (let i = 0; i < MOMENT_CANDIDATES + 5; i++) {
      await catalog.putRevision(cs.id, 'steward', { type: 'segment', data: { text, order: `A${String(i).padStart(4, '0')}`, kind: 'paragraph', content: `${filler} פתח דבר ${filler}`, proofread: 1 } });
    }
    const best = await catalog.putRevision(cs.id, 'steward', { type: 'segment', data: { text, order: 'Z', kind: 'paragraph', content: 'פתח דבר פתח דבר', proofread: 1 } });
    await catalog.submit(cs.id, 'steward');
    if ((await catalog.changeset(cs.id)).status !== 'merged') await catalog.merge(cs.id, 'steward');

    const sql: string[] = [];
    const query = catalog.db.query.bind(catalog.db);
    catalog.db.query = ((q: string, params?: unknown[]) => (sql.push(q), query(q, params))) as typeof catalog.db.query;
    const moments = await searchMoments(catalog, 'פתח דבר', { limit: 3 });
    catalog.db.query = query;
    expect(moments[0]!.id).toBe(best);
    // Without a date to narrow by, the candidates come from the entity row alone; no revision is read before the limit.
    const inner = sql[0]!.slice(0, sql[0]!.indexOf(') c'));
    expect(inner).not.toMatch(/revision/);
  });

  it('narrows to the year, month or day the words were said: a text by its own date or its farbrengen, a transcript by its farbrengen (#90)', async () => {
    const { catalog, set } = await freshCatalog();
    const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'מאמרים' }, slug: 'maamarim', authors: [], genre: 'maamarim', levels: ['maamar'], sets: [set] });
    const body = (p: string) => ({ profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: p }] }] }] });
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    const early = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'maamar', value: '1' }], order: '1', label: { he: 'מאמר 1' }, date: '5711-05-10', body: body('פתח דבר לדוגמה'), sets: [set] });
    const late = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'maamar', value: '2' }], order: '2', label: { he: 'מאמר 2' }, events: [event], body: body('פתח דבר לדוגמה'), sets: [set] });
    const recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
    const heard = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'פתח דבר לדוגמה', proofread: 0, origin: { by: 'transcribe:fake@1' } });

    const ids = async (within: string | null) => (await searchMoments(catalog, 'פתח דבר לדוגמה', { within })).map((m) => m.id).sort();
    expect(await ids(null)).toEqual([early, late, heard].sort());
    expect(await ids('5711')).toEqual([early]);
    expect(await ids('5742-05')).toEqual([late, heard].sort());
    expect(await ids('5742-05-11')).toEqual([]);
    expect(await ids('574')).toEqual([]);
  });
});

describe('search by meaning', () => {
  // A stand-in model: a word's letters make its vector, so texts sharing words are near.
  const fake: Embedder = {
    model: '@cf/baai/bge-m3',
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
        for (const word of t.split(/\s+/)) v[[...word].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % EMBEDDING_DIMENSIONS, 7)] += 1;
        return v;
      });
    },
  };

  it('embeds what has not been, and finds the nearest, labelled as the machine choosing', async () => {
    const { catalog, set } = await freshCatalog();
    const author = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'הרבי' }, kind: 'rebbe', sets: [set] });
    const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'שיחות' }, slug: 'sichos', authors: [author], genre: 'sichos', levels: ['sicha'], sets: [set] });
    const unit = (label: string, order: string, body: string) => add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'sicha', value: label }], order, label: { he: label }, body: page(body), sets: [set] });
    const love = await unit('א', 'V', 'אהבת ישראל ואחדות');
    await unit('ב', 'k', 'שמחה בעבודה');
    expect(embeddingInput({ type: 'unit', data: { label: { he: 'א' }, body: "'''אהבת''' [[ישראל]]" } })).toBe('א אהבת ישראל');

    const first = await embedItems(catalog, fake);
    expect(first.embedded).toBeGreaterThanOrEqual(3);
    expect(await embedItems(catalog, fake)).toEqual({ embedded: 0, skipped: 0 });
    const found = await searchSimilar(catalog, fake, 'אהבת ישראל', { types: ['unit'] });
    expect(found[0]).toMatchObject({ item: { id: love }, machine: true });
    expect(found[0]!.score).toBeGreaterThan(found[1]!.score);
  });
});

describe('health of the catalog', () => {
  it('counts coverage by year, unchecked pages, unsynced recordings and the oldest open suggestions', async () => {
    const { catalog, set } = await freshCatalog();
    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    const waiting = await catalog.createChangeset('chaim', { title: 'תיקון תאריך' });
    await catalog.putRevision(waiting.id, 'chaim', { id: event as EntityId, type: 'event', data: { ...yudShvat(set), date: '5742-05-11' } });
    await catalog.submit(waiting.id, 'chaim');
    await catalog.db.query("INSERT INTO link_check (url, entity_ids, status, ok, error, failing_since) VALUES ('https://example.org/a.mp3', $1, 404, FALSE, 'not found', now())", [[event]]);

    const health = await catalogHealth(catalog);
    expect(health.years).toEqual([{ year: 5742, events: 1, withRecording: 1, withText: 0, withTranscript: 0 }]);
    expect(health.sets).toEqual([expect.objectContaining({ id: set, items: 2 })]);
    expect(health.recordings).toMatchObject({ total: 1, synced: 0 });
    expect(health.unsynced.map((r) => r.id)).toHaveLength(1);
    expect(health.openSuggestions).toMatchObject([{ id: waiting.id, title: 'תיקון תאריך', authorName: 'Chaim' }]);
    expect(health.deadLinks).toMatchObject([{ url: 'https://example.org/a.mp3', status: 404, entities: [event] }]);
  });
});
