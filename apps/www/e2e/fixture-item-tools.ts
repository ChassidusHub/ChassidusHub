/**
 * The item tools in the stand-in API (fixture-api.ts): a sample sicha's
 * versions, talk page and printings, a scan's read text, a sefer's shaar, a
 * file's page and the subject index, and the writes made on them as a
 * signed-in reader (the cookie rh_session=sample). Every word here is sample
 * text written for the tests (לדוגמה), never a sefer's own words.
 */
const he = (text: string) => ({ he: text });
const signedIn = (cookie: string) => /(?:^|; )rh_session=sample(?:;|$)/.test(cookie);

/** The sample sicha the reading tests use (fixture-api.ts), its scan, and a sefer with a shaar. */
const UNIT = 'rh-aaaaaab1';
const SCAN = 'rh-aaaaaat1';
const SEFER = 'rh-aaaaaaw9';
export const SAMPLE_FILE = '5'.repeat(64);

const scan = { id: SCAN, type: 'scan', path: null, rev: 1, data: { publication: 'rh-aaaaaap1', file: SAMPLE_FILE } };
const publication = { id: 'rh-aaaaaap1', type: 'publication', path: null, rev: 1, data: { title: he('דפוס לדוגמה') } };
const sefer = { id: SEFER, type: 'work', path: '/sample-shaar', rev: 1, data: { title: he('ספר עם שער לדוגמה'), genre: 'sichos' } };
const items: Record<string, unknown> = { [SCAN]: scan, [publication.id]: publication, [SEFER]: sefer };

const level = (kind: string, id: string, path: string, name: string) => ({ kind, chosen: { id, path, name: he(name) }, choices: [{ id, path, name: he(name) }] });
const bars: Record<string, unknown[]> = {
  [UNIT]: [level('set', 'rh-aaaaaaa1', '/sets/sample', 'מדף לדוגמה'), level('work', 'rh-aaaaaaa2', '/sample', 'ספר לדוגמה'), level('unit', UNIT, '/sample/1/1', 'שיחה ראשונה')],
  [SEFER]: [level('set', 'rh-aaaaaaa1', '/sets/sample', 'מדף לדוגמה'), level('work', SEFER, '/sample-shaar', 'ספר עם שער לדוגמה')],
};

const person = (id: string, name: string) => ({ author: id, authorName: name, authorIsBot: false });
const history = [
  { commit: 3, at: '2026-10-10T10:00:00Z', message: 'תיקון מילה לדוגמה', mergedBy: 'u-keeper', mergedByName: 'אחראי לדוגמה', ...person('u-sample', 'קורא לדוגמה'), rev: 3, deleted: false, created: false, changes: [{ path: '/body/segments/p1/text', before: [{ text: 'פסקה ראשונה לדוגמא ובה מילה' }], after: [{ text: 'פסקה ראשונה לדוגמה ובה מילה' }] }] },
  { commit: 2, at: '2026-10-05T10:00:00Z', message: 'שם חדש לדוגמה', mergedBy: 'u-keeper', mergedByName: 'אחראי לדוגמה', ...person('u-keeper', 'אחראי לדוגמה'), rev: 2, deleted: false, created: false, changes: [{ path: '/label/he', before: 'שיחה א', after: 'שיחה ראשונה' }] },
  { commit: 1, at: '2026-10-01T10:00:00Z', message: '', mergedBy: 'u-import', mergedByName: null, author: 'u-import', authorName: null, authorIsBot: true, rev: 1, deleted: false, created: true, changes: [] },
];

/** The talk page, as written so far; a comment written in the tests joins it. */
const talk: Array<{ id: number; parent: number | null; author: string; authorName: string; body: string | null; at: string; hidden: boolean }> = [
  { id: 1, parent: null, author: 'u-keeper', authorName: 'אחראי לדוגמה', body: 'נושא לדוגמה: האם חסרה כאן הערה? ראו #12 ו-rh-aaaaaab2.', at: '2026-10-02T10:00:00Z', hidden: false },
  { id: 2, parent: 1, author: 'u-sample', authorName: 'קורא לדוגמה', body: 'תשובה לדוגמה.', at: '2026-10-03T10:00:00Z', hidden: false },
];

const printings = [
  { key: `text:${UNIT}`, label: he('הדפוס הראשון לדוגמה'), publication: null, kind: 'text', checked: true },
  { key: `scan:${SCAN}:1-2`, label: he('סריקה לדוגמה'), publication: 'rh-aaaaaap1', kind: 'scan', checked: false },
  { key: 'text:rh-aaaaaab9', label: he('הדפוס השלישי לדוגמה'), publication: null, kind: 'text', checked: true },
];

const lines = (page: number) => [
  { id: `${page}-1`, text: `שורה ראשונה לדוגמה בעמוד ${page}`, checked: true, level: 2 },
  { id: `${page}-2`, text: 'שורה שניה לדוגמה', checked: true, level: 1 },
  { id: `${page}-3`, text: 'שורה שקראה מכונה לדוגמה', checked: false, level: 0 },
];

const shaar = `---
shaar: 1
title: ספר עם שער לדוגמה
genre: sichos
---

## על הספר | About

ספר לדוגמה, ובו שער לדוגמה.
`;

const mafteach = {
  index: { id: 'rh-aaaaaam1', path: '/likkutei-sichos-mafteach-inyanim', title: he('מפתח לדוגמה') },
  letters: [
    { letter: 'א', topics: 2 },
    { letter: 'ב', topics: 1 },
  ],
  totals: { topics: 3, places: 4, volumes: 2 },
  topics: [
    { topic: 'אהבה לדוגמה', letter: 'א', volumes: [{ volume: 2, label: 'חלק ב', path: '/likkutei-sichos-mafteach-inyanim/2', machine: false, places: [{ page: 412, sicha: 'שיחה לדוגמה', text: '/sample/1/1' }, { page: 15, to: 17, context: 'הקשר לדוגמה', text: '/sample/1/2' }] }] },
    { topic: 'אמונה לדוגמה', letter: 'א', volumes: [{ volume: 15, label: 'חלק טו', path: '/likkutei-sichos-mafteach-inyanim/15', machine: true, places: [{ page: 30, context: 'הקשר שקראה מכונה' }] }] },
  ],
  found: 2,
  offset: 0,
  next: null,
};

const file = {
  sha256: SAMPLE_FILE,
  bytes: 1_468_006,
  mime: 'application/pdf',
  rights: 'open',
  credit: null,
  storage: 'r2',
  url: 'http://localhost:3002/_sample.pdf',
  createdAt: '2026-10-01T10:00:00Z',
  sources: [{ source: 'hebrewbooks', url: 'https://example.org/sample', fetchedAt: '2026-10-01T10:00:00Z', attestation: null, uploaded: false, at: '2026-10-01T10:00:00Z' }],
  derivations: [{ profile: 'reading-copy', sha256: '6'.repeat(64), bytes: 900_000, encoder: 'sample-1' }],
  derivedFrom: [],
  measured: { kind: 'pdf-pages', pages: 24, durationMs: null, encoder: 'sample' },
  pageImages: 24,
  pageFix: null,
  covers: [{ entity: SEFER, page: 1, machine: true }],
  usedBy: { total: 1, items: [scan] },
};

/** What the tests sent, newest last (GET /_tools). */
const sent: Array<{ path: string; body: unknown }> = [];

/**
 * The stand-in's answer to an item tools read or write, or undefined when
 * the request is not one: [status, body].
 */
export function itemToolsAnswer(method: string, url: URL, body: Record<string, unknown>, cookie: string): [number, unknown] | undefined {
  const path = url.pathname;
  if (method === 'GET') {
    if (path === '/_tools') return [200, sent];
    const entity = /^\/v1\/entities\/(rh-[\w-]+)(\/[\w-]+)?$/.exec(path);
    if (entity) {
      const [, id, what] = entity;
      if (!what && items[id!]) return [200, items[id!]];
      if (what === '/path-bar' && bars[id!]) return [200, { levels: bars[id!] }];
      if (what === '/history' && id === UNIT) return [200, { history }];
      if (what === '/talk' && id === UNIT) return [200, { talk }];
      if (what === '/shaar' && id === SEFER) return [200, { text: shaar, machine: true }];
      return undefined;
    }
    if (path === '/v1/entities/batch') return [200, { items: (url.searchParams.get('ids') ?? '').split(',').map((id) => items[id]).filter(Boolean) }];
    if (path === `/v1/units/${UNIT}/printings`) return [200, { printings }];
    if (path === '/v1/compare') {
      const [a, b] = [url.searchParams.get('a'), url.searchParams.get('b')];
      return [200, { a: { key: a, checked: true }, b: { key: b, checked: !b?.startsWith('scan:') }, same: 6, removed: 1, added: 1, runs: [{ op: 'same', text: 'פסקה ראשונה ' }, { op: 'removed', text: 'לדוגמא' }, { op: 'added', text: 'לדוגמה' }, { op: 'same', text: ' ובה מילה מודגשת והערה.' }] }];
    }
    if (path === `/v1/scans/${SCAN}/text`) {
      const page = Number(url.searchParams.get('page') ?? 1);
      if (page > 2) return [404, { error: 'not-found', message: 'not read yet' }];
      return [200, { scan: SCAN, page, pages: 3, machine: false, engine: { name: 'sample-ocr', version: '1' }, level: 1, lines: lines(page), layers: [{ id: 'layer-1', kind: 'machine-ocr', engine: { name: 'sample-ocr', version: '1' }, uploadedBy: null, seeds: true }, { id: 'layer-2', kind: 'uploaded-ocr', engine: { name: 'other-ocr', version: '2' }, uploadedBy: 'u-sample', seeds: false }] }];
    }
    if (path === `/v1/scans/${SCAN}/progress`) return [200, { pages: 3, levels: [1, 0, 2] }];
    if (path === `/v1/scans/${SCAN}/pages`) return [404, { error: 'not-found', message: 'not served' }];
    if (path === `/v1/files/${SAMPLE_FILE}/about`) return [200, file];
    if (path === '/v1/mafteach') {
      const q = url.searchParams.get('q');
      return [200, q ? { ...mafteach, topics: mafteach.topics.filter((t) => t.topic.includes(q)), found: mafteach.topics.filter((t) => t.topic.includes(q)).length } : mafteach];
    }
    return undefined;
  }

  const writes = [`/v1/entities/${UNIT}/talk`, `/v1/entities/${UNIT}/restore`, `/v1/scans/${SCAN}/text/fix`, `/v1/scans/${SCAN}/text/confirm`, `/v1/scans/${SCAN}/text/seed`, `/v1/scans/${SCAN}/ocr`, '/v1/suggestions/shaar'];
  const hide = /^\/v1\/comments\/(\d+)\/hide$/.exec(path);
  if (!writes.includes(path) && !hide) return undefined;
  if (!signedIn(cookie)) return [401, { error: 'unauthorized', message: 'sign in first' }];
  sent.push({ path, body });
  if (path.endsWith('/talk')) {
    const id = talk.length + 1;
    talk.push({ id, parent: typeof body.parent === 'number' ? body.parent : null, author: 'u-sample', authorName: 'קורא לדוגמה', body: String(body.body), at: '2026-10-11T10:00:00Z', hidden: false });
    return [201, { id }];
  }
  if (hide) {
    const comment = talk.find((c) => c.id === Number(hide[1]));
    if (comment) comment.hidden = true;
    return [200, { ok: true }];
  }
  if (path.endsWith('/restore')) return [201, { suggestion: 301 }];
  if (path === '/v1/suggestions/shaar') return [201, { id: 302, status: 'open' }];
  return [201, { id: 303, title: 'sample', status: 'open' }];
}
