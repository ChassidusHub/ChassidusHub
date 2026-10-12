import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityId } from '@chassidushub/model';
import { EMBEDDING_DIMENSIONS, embedItems, type Embedder } from '@chassidushub/core';
import { createApp } from '../src/app.js';
import { add, freshCatalog, yudShvat } from '../../../packages/core/tests/helpers.js';

let catalog: Awaited<ReturnType<typeof freshCatalog>>['catalog'];
let set: EntityId;
let event: EntityId;

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

beforeEach(async () => {
  ({ catalog, set } = await freshCatalog());
  event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set), '/events/5742-05-10');
});

const json = async (app: ReturnType<typeof createApp>, path: string) => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as any };
};

describe('search filters (#72)', () => {
  it('narrows /v1/search by author, set, topic and language, combined, for Hebrew and English words', async () => {
    const author = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'מחבר א' }, kind: 'rebbe' });
    const topic = await add(catalog, 'mendy', 'keeper', 'topic', { name: { he: 'נושא' }, sets: [set] });
    const english = [{ kind: 'text', source: 'sefaria', licence: 'cc0', language: 'en', sourceId: 'Example' }];
    const mine = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'זזזג אחד', en: 'Qwzx One' }, slug: 'one', authors: [author], genre: 'chassidus', levels: ['chapter'], sets: [set], topics: [topic] }, '/one');
    const other = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'זזזג שני', en: 'Qwzx Two' }, slug: 'two', authors: [], genre: 'chassidus', levels: ['chapter'], sets: [set], sourceCopies: english }, '/two');
    const app = createApp({ catalog });
    const ids = async (query: string) => {
      const { status, body } = await json(app, `/v1/search?${query}`);
      expect(status).toBe(200);
      return (body.results as Array<{ id: string }>).map((r) => r.id).sort();
    };
    const q = (words: string) => `q=${encodeURIComponent(words)}`;
    expect(await ids(q('זזזג'))).toEqual([mine, other].sort());
    expect(await ids(`${q('זזזג')}&author=${author}`)).toEqual([mine]);
    expect(await ids(`${q('qwzx')}&topic=${topic}`)).toEqual([mine]);
    expect(await ids(`${q('qwzx')}&language=en`)).toEqual([other]);
    expect(await ids(`${q('זזזג')}&set=${set}&language=he`)).toEqual([mine]);
    expect(await ids(`${q('זזזג')}&author=${author}&language=en`)).toEqual([]);
    expect((await json(app, `/v1/search?${q('זזזג')}&language=xx`)).status).toBe(400);
  });
});

describe('search that lands on the moment, and by meaning', () => {
  it('gives the paragraph of a transcript with the moment it is heard', async () => {
    const recording = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'transcript', recording, language: 'yi' });
    const segment = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'אהבת ישראל', proofread: 0, origin: { by: 'transcribe:fake@1' } });
    const alignment = await add(catalog, 'mendy', 'keeper', 'alignment', { recording, text, granularity: 'paragraph' });
    await add(catalog, 'mendy', 'keeper', 'alignment-span', { alignment, segment, startMs: 61_000, endMs: 90_000 });
    const app = createApp({ catalog });
    const { body } = await json(app, `/v1/search/moments?q=${encodeURIComponent('אהבת')}`);
    expect(body.moments).toMatchObject([{ kind: 'paragraph', id: segment, event, recording, startMs: 61_000, machine: true }]);
    // What was said then comes first, then the rest (#167): another year still finds it; a date must be a date key.
    expect((await json(app, `/v1/search/moments?q=${encodeURIComponent('אהבת')}&within=5742`)).body.moments).toHaveLength(1);
    expect((await json(app, `/v1/search/moments?q=${encodeURIComponent('אהבת')}&within=5711`)).body.moments).toHaveLength(1);
    expect((await json(app, `/v1/search/moments?q=${encodeURIComponent('אהבת')}&within=${encodeURIComponent('57%')}`)).status).toBe(422);
    // lean=1 (temporary) ranks fewer paragraphs; with few matches it answers the same, never kept.
    const lean = await app.request(`/v1/search/moments?q=${encodeURIComponent('אהבת')}&lean=1`);
    expect(lean.headers.get('Cache-Control')).toBe('no-store');
    expect(((await lean.json()) as { moments: unknown[] }).moments).toEqual(body.moments);

    // A subject in English letters is looked for as the texts write it, by the older reads too (#99): the site's /search uses them.
    const english = (await json(app, `/v1/search/moments?q=${encodeURIComponent('ahavas yisroel')}`)).body;
    expect(english.topic).toEqual({ key: 'ahavas yisroel', he: 'אהבת ישראל' });
    expect(english.moments).toMatchObject([{ id: segment }]);
    const named = (await json(app, `/v1/search?q=${encodeURIComponent('ahavas yisroel')}`)).body;
    expect(named.topic).toEqual({ key: 'ahavas yisroel', he: 'אהבת ישראל' });
    expect((await json(app, `/v1/search?q=${encodeURIComponent('אהבת')}`)).body.topic).toBeNull();

    // The new site's screen: the transcript opens at its farbrengen at the moment heard; a date alone is that day's farbrengen.
    const page = (await json(app, `/v1/search/page?q=${encodeURIComponent('אהבת')}`)).body;
    expect(page.words).toMatchObject([{ id: segment, kind: 'paragraph', title: 'יו״ד שבט תשמ״ב', path: '/events/5742-05-10?t=61', machine: true }]);
    const day = (await json(app, `/v1/search/page?q=${encodeURIComponent('יו"ד שבט תשמ"ב')}`)).body;
    expect(day).toMatchObject({ date: { key: '5742-05-10' }, within: '5742-05-10', top: { id: event, kind: 'farbrengen', listen: true }, words: [] });
    expect((await json(app, `/v1/search/page?q=x&within=${encodeURIComponent('57%')}`)).status).toBe(422);
    expect((await json(app, '/v1/search/page?q=x&language=xx')).status).toBe(422);
    expect((await json(app, '/v1/search/page?q=x&language=en')).status).toBe(200);
    expect((await json(app, `/v1/search/suggest?q=${encodeURIComponent('יו״ד שבט')}`)).body.hits).toMatchObject([{ id: event, type: 'event', kind: 'farbrengen' }]);
  });

  it("gives a farbrengen's parts their synced hanachos in one request, and each part its own", async () => {
    const first = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק א' }, url: 'https://example.org/a.mp3', sets: [set] });
    const second = await add(catalog, 'mendy', 'keeper', 'recording', { event, title: { he: 'חלק ב' }, url: 'https://example.org/b.mp3', sets: [set] });
    const text = await add(catalog, 'mendy', 'keeper', 'text', { kind: 'hanacha', recording: first, language: 'he' });
    const segment = await add(catalog, 'mendy', 'keeper', 'segment', { text, order: 'V', kind: 'paragraph', content: 'אהבת ישראל', proofread: 1 });
    const alignment = await add(catalog, 'mendy', 'keeper', 'alignment', { recording: first, text, granularity: 'paragraph' });
    await add(catalog, 'mendy', 'keeper', 'alignment-span', { alignment, segment, startMs: 61_000, endMs: 90_000 });
    const app = createApp({ catalog });
    const sync = { text, alignment, paragraphs: [{ id: segment, content: 'אהבת ישראל', startMs: 61_000, endMs: 90_000, checked: false }] };
    expect((await json(app, `/v1/recordings/${first}/hanacha`)).body).toEqual(sync);
    expect((await json(app, `/v1/recordings/${second}/hanacha`)).status).toBe(404);
    // Both parts at once: the one without a synced hanacha is left out.
    expect((await json(app, `/v1/recordings/batch/hanacha?ids=${first},${second}`)).body).toEqual({ items: { [first]: sync } });
    expect((await json(app, '/v1/recordings/batch/hanacha?ids=')).body).toEqual({ items: {} });
  });

  it('says search by meaning is not available until it is set up and its vectors are made, and labels what it finds', async () => {
    expect((await json(createApp({ catalog }), '/v1/search/similar?q=x')).body).toEqual({ query: 'x', available: false, machine: true, results: [] });
    // Set up with no vectors made yet, it says so rather than finding nothing for every question (#98).
    expect((await json(createApp({ catalog, embedder: fake }), '/v1/search/similar?q=x')).body).toEqual({ query: 'x', available: false, model: fake.model, machine: true, results: [] });
    await embedItems(catalog, fake);
    const app = createApp({ catalog, embedder: fake });
    const { body } = await json(app, `/v1/search/similar?q=${encodeURIComponent('יו״ד שבט')}&types=event`);
    expect(body).toMatchObject({ available: true, machine: true, results: [{ item: { id: event }, machine: true }] });
    expect((await json(app, '/v1/search/similar?q=x&types=spaceship')).status).toBe(400);
  });
});

describe('links and health', () => {
  it("shows an item's links both ways, and the catalog's health", async () => {
    const other = await add(catalog, 'mendy', 'keeper', 'event', { ...yudShvat(set), date: '5743-05-10', title: { he: 'יו״ד שבט תשמ״ג' } });
    await add(catalog, 'mendy', 'keeper', 'relation', { kind: 'cites', from: other, to: event, note: 'שיחת יו״ד שבט תשמ״ב', origin: { by: 'citations@1' } });
    const app = createApp({ catalog });
    expect((await json(app, `/v1/entities/${event}/relations`)).body.relations).toMatchObject([{ kind: 'cites', direction: 'in', other, machine: true }]);
    const health = (await json(app, '/v1/health')).body;
    expect(health.years.map((y: { year: number }) => y.year)).toEqual([5742, 5743]);
    expect(health).toMatchObject({ recordings: { total: 0 }, links: { checked: 0, dead: 0 }, embeddings: { embedded: 0 } });
  });
});

describe('OAI-PMH', () => {
  const xml = async (app: ReturnType<typeof createApp>, query: string) => {
    const response = await app.request(`http://api.test/oai?${query}`);
    expect(response.headers.get('content-type')).toContain('text/xml');
    return response.text();
  };

  it('is offered only with an administrators address', async () => {
    expect((await createApp({ catalog }).request('/oai?verb=Identify')).status).toBe(404);
  });

  it('identifies itself, lists records a page at a time, and reports deletions', async () => {
    const author = await add(catalog, 'steward', 'steward', 'author', { name: { he: 'הרבי', en: 'The Rebbe' }, kind: 'rebbe', rebbe: 7, sets: [set] });
    const work = await add(catalog, 'mendy', 'keeper', 'work', { title: { he: 'לקוטי שיחות', en: 'Likkutei Sichos' }, slug: 'likkutei-sichos', authors: [author], genre: 'sichos', levels: ['volume'], sets: [set] }, '/likkutei-sichos');
    const unit = await add(catalog, 'mendy', 'keeper', 'unit', { work, position: [{ level: 'volume', value: '1' }], order: 'V', label: { he: 'בראשית' }, date: '5725-07-01', events: [event], sets: [set] });
    const app = createApp({ catalog, oai: { adminEmail: 'stewards@example.org', siteUrl: 'https://chassidushub.test', pageSize: 2 } });

    const identify = await xml(app, 'verb=Identify');
    expect(identify).toContain('<adminEmail>stewards@example.org</adminEmail>');
    expect(identify).toContain('<deletedRecord>persistent</deletedRecord>');
    expect(identify).toContain('<request verb="Identify">http://api.test/oai</request>');

    const first = await xml(app, 'verb=ListIdentifiers&metadataPrefix=oai_dc');
    expect(first.match(/<header>/g)).toHaveLength(2);
    const token = /<resumptionToken>([^<]+)<\/resumptionToken>/.exec(first)![1]!;
    const second = await xml(app, `verb=ListRecords&resumptionToken=${token}`);
    expect(second).toContain(`<identifier>oai:chassidushub.test:${unit}</identifier>`);
    expect(second).toContain('<dc:title xml:lang="he">בראשית</dc:title>');
    expect(second).toContain('<dc:creator xml:lang="en">The Rebbe</dc:creator>');
    expect(second).toContain('<dc:relation>https://chassidushub.test/likkutei-sichos</dc:relation>');
    expect(second).toContain('<resumptionToken></resumptionToken>');

    const record = await xml(app, `verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:chassidushub.test:${event}`);
    expect(record).toContain('<dc:type>Event</dc:type>');
    expect(record).toContain('<dc:coverage xml:lang="en">10 Shevat 5742</dc:coverage>');
    expect(record).toContain(`<setSpec>set:${set}</setSpec>`);

    const cs = await catalog.createChangeset('mendy', { title: 'מחיקה' });
    await catalog.putRevision(cs.id, 'mendy', { id: unit, type: 'unit', data: null });
    await catalog.submit(cs.id, 'mendy');
    await catalog.merge(cs.id, 'keeper');
    const today = new Date().toISOString().slice(0, 10);
    const changed = await xml(app, `verb=ListIdentifiers&metadataPrefix=oai_dc&from=${today}&set=type:unit`);
    expect(changed).toContain(`<header status="deleted"><identifier>oai:chassidushub.test:${unit}</identifier>`);

    expect(await xml(app, 'verb=Nope')).toContain('<error code="badVerb">');
    expect(await xml(app, 'verb=ListRecords')).toContain('<error code="badArgument">');
    expect(await xml(app, 'verb=ListRecords&metadataPrefix=marc')).toContain('<error code="cannotDisseminateFormat">');
    expect(await xml(app, 'verb=GetRecord&metadataPrefix=oai_dc&identifier=oai:elsewhere:rh-0000000')).toContain('<error code="idDoesNotExist">');
    expect(await xml(app, 'verb=ListRecords&resumptionToken=junk')).toContain('<error code="badResumptionToken">');
    expect(await xml(app, 'verb=ListRecords&metadataPrefix=oai_dc&from=2000-01-01&until=2000-01-02')).toContain('<error code="noRecordsMatch">');
    expect(await xml(app, 'verb=ListSets')).toContain('<setSpec>type:unit</setSpec>');
  });
});
