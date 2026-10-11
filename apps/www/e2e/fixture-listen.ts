/**
 * Listening in the stand-in API (fixture-api.ts): a few made-up events with
 * recordings, so Home and listening are tested without the live API. The ids
 * and dates match the pages in e2e/pages.ts; every title and word here is
 * sample text written for the tests (לדוגמה), never the Rebbe's own words.
 */
const he = (text: string) => ({ he: text });

const events = [
  { id: 'rh-3dvjfkyc', type: 'event', path: '/events/5732-11-20', data: { date: '5732-11-20', kind: 'farbrengen', title: he('התוועדות לדוגמה') }, recordings: 2 },
  { id: 'rh-aaaaaae1', type: 'event', path: '/events/5747-03-19', data: { date: '5747-03-19', kind: 'farbrengen', title: he('י״ט כסלו לדוגמה') }, recordings: 1 },
  { id: 'rh-aaaaaae2', type: 'event', path: '/events/5747-05-10', data: { date: '5747-05-10', kind: 'farbrengen' }, recordings: 3 },
  { id: 'rh-aaaaaae3', type: 'event', path: '/events/5711-03-19', data: { date: '5711-03-19', kind: 'sicha' }, recordings: 1 },
];

const recordings = [
  { id: 'rh-1awcd7t9', type: 'recording', path: null, data: { event: 'rh-3dvjfkyc', part: 1, title: he('שיחה א׳'), url: 'http://localhost/sample-1.mp3', durationMs: 600_000 } },
  { id: 'rh-aaaaaar2', type: 'recording', path: null, data: { event: 'rh-3dvjfkyc', part: 2, title: he('ניגון'), url: 'http://localhost/sample-2.mp3', durationMs: 120_000 } },
];

const transcripts: Record<string, unknown> = {
  'rh-1awcd7t9': {
    paragraphs: [
      { id: 'p1', content: 'פסקה ראשונה לדוגמה, שנשמעה בהקלטה.', startMs: 0, checked: false },
      { id: 'p2', content: 'פסקה שניה לדוגמה, ועוד כמה מילים.', startMs: 40_000, checked: false },
      { id: 'p3', content: 'פסקה שלישית לדוגמה.', startMs: 90_000, checked: true },
    ],
  },
};

/** Shelves of the library, two Rebbeim's and one under them; the library's own samples join them (fixture-library.ts). */
export const shelves = [
  { id: 'rh-aaaaaas1', type: 'set', path: '/sets/alter-rebbe', data: { slug: 'alter-rebbe', name: he('אדמו״ר הזקן'), order: 'c' } },
  { id: 'rh-aaaaaas2', type: 'set', path: '/sets/alter-rebbe-sample', data: { slug: 'alter-rebbe-sample', name: he('ספר לדוגמה'), order: 'a', parent: 'rh-aaaaaas1' } },
  { id: 'rh-aaaaaas3', type: 'set', path: '/sets/the-rebbe', data: { slug: 'the-rebbe', name: he('הרבי'), order: 'i' } },
];

/** The answer to a listening read, or undefined when it is not one. */
export function listenAnswer(url: URL): unknown {
  const query = (name: string) => url.searchParams.get(name);
  const path = url.pathname;
  if (path === '/v1/transcripts') return { recordings: [{ recording: 'rh-1awcd7t9', event: 'rh-3dvjfkyc' }] };
  if (path === '/v1/events') {
    const days = query('day')?.split(',');
    const year = query('within');
    return { items: events.filter((e) => (days ? days.includes(e.data.date.slice(5)) : year ? e.data.date.startsWith(`${year}-`) : true)) };
  }
  if (path === '/v1/entities' && query('type') === 'set') return { items: shelves };
  if (path === '/v1/files/batch') return { items: [] };
  const children = path.match(/^\/v1\/entities\/([^/]+)\/children$/);
  if (children) return { items: recordings.filter((r) => r.data.event === children[1]) };
  const entity = path.match(/^\/v1\/entities\/([^/]+)$/);
  if (entity) return events.find((e) => e.id === entity[1]) ?? recordings.find((r) => r.id === entity[1]);
  const transcript = path.match(/^\/v1\/recordings\/([^/]+)\/transcript$/);
  if (transcript) return transcripts[transcript[1]!];
  return undefined;
}

/** A transcript paragraph's words, for the stand-in's POST /v1/fix on a recording. */
export function paragraphWords(recording: string, id: string): string | undefined {
  return (transcripts[recording] as { paragraphs: { id: string; content: string }[] } | undefined)?.paragraphs.find((p) => p.id === id)?.content;
}
