import { cleanLabel, describeDate, UNIT_KIND, type Hit, type SearchPage, type WordHit } from './names';

/**
 * The Search screen's reads. Until the API answers a search in one
 * display-ready read (asked of the data lane, #88-#90), the page is put
 * together here from today's reads, in at most two rounds: the search, the
 * words inside the texts and the date's farbrengens together, then the names
 * of the sefarim and farbrengens they point to in one batch. When the one read
 * lands, only this file changes.
 */

const API = (typeof process !== 'undefined' && process.env.API_URL) || 'https://api.chassidushub.org';

interface Item {
  id: string;
  type: string;
  path: string | null;
  recordings?: number;
  data: {
    title?: { he?: string; en?: string };
    label?: { he?: string; en?: string };
    name?: { he?: string; en?: string };
    work?: string;
    genre?: string;
    date?: string;
    kind?: string;
    position?: { level: string; value: string; label?: { he?: string } }[];
  };
}

interface Moment {
  kind: 'paragraph' | 'scan-line';
  id: string;
  unit?: string | null;
  event?: string | null;
  recording?: string | null;
  startMs?: number | null;
  snippet?: string;
  publication?: string | null;
  page?: number;
  line?: { text: string };
  hits: string[];
  machine: boolean;
}

async function read<T>(path: string, wait = 6000): Promise<T> {
  const response = await fetch(`${API}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(wait) });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

const he = (name?: { he?: string; en?: string }) => name?.he ?? name?.en ?? '';

/** Hebrew letters only, no quotes or gershayim, one space between words: how a title is compared with what was typed. */
const plain = (text: string) =>
  text
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The batch of items the results name: their sefarim, farbrengens and printings. */
async function namesOf(ids: Iterable<string>): Promise<Map<string, Item>> {
  const wanted = [...new Set(ids)].slice(0, 200);
  if (wanted.length === 0) return new Map();
  const { items } = await read<{ items: Item[] }>(`/v1/entities/batch?ids=${wanted.join(',')}`).catch(() => ({ items: [] as Item[] }));
  return new Map(items.map((item) => [item.id, item]));
}

/** One catalog item as a result row. */
function hitOf(item: Item, names: Map<string, Item>): Hit | null {
  if (!item.path) return null;
  const data = item.data;
  if (item.type === 'event') {
    const date = data.date ? describeDate(data.date) : he(data.title);
    const occasion = he(data.title);
    const recordings = item.recordings ? `${item.recordings} הקלטות` : '';
    return {
      kind: 'התוועדות',
      title: date,
      sub: [occasion && !date.includes(plain(occasion)) ? occasion : '', recordings].filter(Boolean).join(' · ') || 'התוועדות',
      to: item.path,
      listen: item.recordings ? item.path : undefined,
    };
  }
  if (item.type === 'unit') {
    const work = data.work ? names.get(data.work) : undefined;
    const volume = data.position?.find((p) => p.level === 'volume' || p.level === 'part')?.label?.he;
    return {
      kind: UNIT_KIND[work?.data.genre ?? ''] ?? 'פרק',
      title: cleanLabel(he(data.label) || he(data.title)),
      sub: [he(work?.data.title), volume].filter(Boolean).join(' · '),
      to: item.path,
    };
  }
  const title = he(data.title) || he(data.name) || he(data.label);
  if (!title) return null;
  const kind = item.type === 'work' ? 'ספר' : item.type === 'publication' ? 'דפוס' : item.type === 'recording' ? 'הקלטה' : item.type === 'author' || item.type === 'person' ? 'אישים' : 'מדף';
  const of = data.work ? he(names.get(data.work)?.data.title) : '';
  return { kind, title: cleanLabel(title), sub: of || kind, to: item.path };
}

/** Words found inside a text, as a row: the words around them, and the sefer and page or farbrengen they are in. */
function wordHitOf(moment: Moment, names: Map<string, Item>): WordHit | null {
  if (moment.kind === 'scan-line') {
    const printing = moment.publication ? names.get(moment.publication) : undefined;
    if (!printing?.path || !moment.line) return null;
    return {
      snippet: moment.line.text,
      hits: moment.hits,
      sub: [he(printing.data.title), moment.page ? `עמ׳ ${moment.page}` : ''].filter(Boolean).join(' · '),
      to: `${printing.path}?page=${moment.page ?? 1}`,
      machine: moment.machine,
    };
  }
  const unit = moment.unit ? names.get(moment.unit) : undefined;
  const event = moment.event ? names.get(moment.event) : undefined;
  const at = unit ?? event;
  if (!at?.path || !moment.snippet) return null;
  const heard = moment.startMs != null && !unit ? `?t=${Math.floor(moment.startMs / 1000)}` : '';
  const sub = unit
    ? [cleanLabel(he(unit.data.label)), he(unit.data.work ? names.get(unit.data.work)?.data.title : undefined)].filter(Boolean).join(' · ')
    : [`התוועדות ${event?.data.date ? describeDate(event.data.date) : ''}`.trim(), he(event?.data.title)].filter(Boolean).join(' · ');
  return { snippet: moment.snippet, hits: moment.hits, sub, to: `${at.path}${heard}`, machine: moment.machine };
}

/**
 * The best answer to what was typed: the farbrengen of the date it names,
 * else the first result whose name is what was typed (a ד"ה, a sefer, a
 * parsha). A guess is no answer: with neither, the results start with the list.
 */
function chooseTop(query: string, dated: Hit[], hits: Hit[]): Hit | null {
  if (dated[0]) return dated[0];
  const typed = plain(query.replace(/^ד["״]?ה\s*/, ''));
  return (typed && hits.find((hit) => plain(hit.title).includes(typed))) || null;
}

/** The whole results page for one query. */
export async function searchPage(query: string): Promise<SearchPage> {
  const q = encodeURIComponent(query);
  const [found, moments] = await Promise.all([
    read<{ date: { key: string; he: string } | null; results: Item[] }>(`/v1/search?q=${q}&limit=20`),
    read<{ moments: Moment[] }>(`/v1/search/moments?q=${q}&limit=8`).catch(() => ({ moments: [] as Moment[] })),
  ]).catch(() => [null, null] as const);
  if (!found) return { query, top: null, works: [], events: [], words: [], failed: true };

  const [dated, names] = await Promise.all([
    found.date ? read<{ items: Item[] }>(`/v1/events?dates=${found.date.key}&limit=5`).catch(() => ({ items: [] as Item[] })) : { items: [] as Item[] },
    namesOf([
      ...found.results.flatMap((item) => (item.data.work ? [item.data.work] : [])),
      ...(moments?.moments ?? []).flatMap((m) => [m.unit, m.event, m.publication].filter((id): id is string => Boolean(id))),
    ]),
  ]);
  // A unit found by its words is named with its sefer: one more batch only when the units found are new.
  const units = [...names.values()].flatMap((item) => (item.type === 'unit' && item.data.work && !names.has(item.data.work) ? [item.data.work] : []));
  for (const [id, item] of await namesOf(units)) names.set(id, item);

  const dates = dated.items.map((item) => hitOf(item, names)).filter((hit): hit is Hit => hit !== null);
  const hits = found.results.map((item) => hitOf(item, names)).filter((hit): hit is Hit => hit !== null);
  const top = chooseTop(query, dates, hits);
  const rest = [...dates, ...hits].filter((hit) => hit !== top && hit.to !== top?.to);
  return {
    query,
    top,
    works: rest.filter((hit) => hit.kind !== 'התוועדות'),
    events: rest.filter((hit) => hit.kind === 'התוועדות'),
    words: (moments?.moments ?? []).map((m) => wordHitOf(m, names)).filter((hit): hit is WordHit => hit !== null),
  };
}

/** A few rows while typing: the search's first answers, named. */
export async function suggestions(query: string): Promise<Hit[]> {
  const found = await read<{ results: Item[] }>(`/v1/search?q=${encodeURIComponent(query)}&limit=6`, 3000).catch(() => null);
  if (!found) return [];
  const names = await namesOf(found.results.flatMap((item) => (item.data.work ? [item.data.work] : [])));
  return found.results.map((item) => hitOf(item, names)).filter((hit): hit is Hit => hit !== null);
}
