import { describeDateKey, normalizeSearchText, parseDateText } from '@chassidushub/hebrew';
import type { EntityId, EntityType } from '@chassidushub/model';
import type { Catalog } from './catalog.js';
import { matchingWords, queryWords, searchMoments, type Moment } from './moments.js';
import { searchTierSql, toTsQuery } from './searchText.js';

/**
 * The new site's search screen in one read (apps/www): everything the page
 * shows, ready to draw, in at most six statements. Sefarim, shelves and
 * sichos the words name; the farbrengens and recordings they name, or that
 * were on the date they give; and the places in the words themselves,
 * each opening at its paragraph, line or moment. A date in the query
 * ("תשי"א", "יו"ד שבט תשי"א") is taken as the date, not as words: it
 * narrows the words to that year, month or day, and alone it finds that
 * day's farbrengen. Titles and the line under them are in Hebrew, as the
 * site shows them.
 */

/** A thing found by its name: a sefer, a shelf, a sicha, a farbrengen, a recording. */
export interface SearchHit {
  id: EntityId;
  type: EntityType;
  /** What it is, from the item: `sefer`, `shelf`, `sicha`, `maamar`, `farbrengen`, `recording`, … */
  kind: string;
  title: string;
  /** The line under the title: the sefer and volume of a sicha, a sefer's author, a farbrengen's date. */
  sub: string;
  path: string | null;
  /** It can be heard (a recording, or a farbrengen that has one). */
  listen?: true;
  /** It has words to read (a unit's own text, or a farbrengen's hanacha). */
  read?: true;
}

/** A place in the words: a paragraph of a sefer or a transcript, or a line on a scan's page. */
export interface SearchWordHit {
  id: EntityId;
  kind: 'paragraph' | 'scan-line';
  title: string;
  sub: string;
  /** Opens at the place: a sefer's words at `path#segment`, a scan at `/text/{scan}?page=&line=`, a recording at `?t=<seconds>`. */
  path: string;
  snippet: string;
  /** Where the query's words are in `snippet`, as [start, end) character offsets, to mark. */
  marks: Array<[number, number]>;
  /** Still as a machine read or heard it: nobody has checked it. */
  machine: boolean;
  /** The words begin with the query (a maamar's ד"ה): these come first. */
  opening: boolean;
}

export interface SearchPage {
  query: string;
  /** The date the query names, when it names one. */
  date: { key: string; he: string } | null;
  /** The date the words are narrowed to: the `within` asked for, else the query's date. */
  within: string | null;
  /** What the person most likely wants: the day's farbrengen, a maamar that opens with the words, else the best name. */
  top: SearchHit | null;
  works: SearchHit[];
  events: SearchHit[];
  words: SearchWordHit[];
}

/** The kinds of item a name search lists; the words themselves come as `words`. */
const NAMED: EntityType[] = ['set', 'work', 'unit', 'event', 'recording', 'publication', 'author'];
const NAME_HITS = 30;
const DATED_HITS = 20;
export const SUGGEST_HITS = 6;

interface Info {
  id: EntityId;
  type: EntityType;
  path: string | null;
  name: Local | null;
  date: string | null;
  kind: string | null;
  position: Array<{ level: string; value: string; label?: Local }> | null;
  /** The names of what it belongs to: a unit's sefer, a sefer's author, a shelf's shelf, a recording's farbrengen. */
  work: Local | null;
  author: Local | null;
  parent: Local | null;
  event: Local | null;
  listen: boolean;
  read: boolean;
  dated?: boolean;
}

type Local = { he?: string; en?: string };

/** An item's facts for a hit, with the names of what it belongs to, all in the one statement that finds it. */
const INFO = `e.id, e.type, e.path,
  coalesce(r.data->'title', r.data->'name', r.data->'label') AS name,
  r.data->>'date' AS date, r.data->>'kind' AS kind, r.data->'position' AS position,
  (SELECT x.data->'title' FROM entity o JOIN revision x ON x.id = o.main_rev WHERE o.id = r.data->>'work') AS work,
  (SELECT x.data->'name' FROM entity o JOIN revision x ON x.id = o.main_rev WHERE o.id = r.data->'authors'->>0) AS author,
  (SELECT x.data->'name' FROM entity o JOIN revision x ON x.id = o.main_rev WHERE o.id = r.data->>'parent') AS parent,
  (SELECT x.data->'title' FROM entity o JOIN revision x ON x.id = o.main_rev WHERE o.id = r.data->>'event') AS event,
  CASE e.type WHEN 'recording' THEN TRUE
    WHEN 'event' THEN EXISTS (SELECT 1 FROM revision g JOIN entity ge ON ge.main_rev = g.id WHERE g.data->>'event' = e.id AND ge.type = 'recording' AND NOT ge.deleted)
    ELSE FALSE END AS listen,
  CASE e.type WHEN 'unit' THEN r.data ? 'body'
    WHEN 'event' THEN coalesce(r.data->'links' @> '[{"kind":"mugah"}]' OR r.data->'links' @> '[{"kind":"bilti-mugah"}]', FALSE)
    ELSE FALSE END AS read`;

/** Items found by name, best first, with their facts: one statement. */
async function namedInfo(catalog: Catalog, query: string, limit: number): Promise<Info[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];
  const { rows } = await catalog.db.query<Info>(
    `SELECT ${INFO} FROM entity e JOIN revision r ON r.id = e.main_rev
     WHERE e.search_tsv @@ to_tsquery('simple', $1) AND NOT e.deleted AND e.main_rev IS NOT NULL AND e.type = ANY($3::text[])
     ORDER BY ${searchTierSql('$2', '$1')}, ts_rank(e.search_tsv, to_tsquery('simple', $1)) DESC, e.path
     LIMIT ${limit}`,
    [tsQuery, normalizeSearchText(query), NAMED],
  );
  return rows;
}

/** Items by id (what the found words belong to), and the events on a date, with their facts: one statement. */
async function infoOf(catalog: Catalog, ids: readonly EntityId[], date: string | null): Promise<Info[]> {
  if (ids.length === 0 && !date) return [];
  const { rows } = await catalog.db.query<Info>(
    `(SELECT ${INFO}, FALSE AS dated FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND NOT e.deleted)
     UNION ALL
     (SELECT ${INFO}, TRUE AS dated FROM entity e JOIN revision r ON r.id = e.main_rev
      WHERE $2::text IS NOT NULL AND e.type = 'event' AND NOT e.deleted AND (r.data->>'date' || '-') LIKE $2 || '-%'
      ORDER BY (r.data->>'kind' <> 'farbrengen'), r.data->>'date' COLLATE "C", coalesce((r.data->>'order')::int, 0), e.id LIMIT ${DATED_HITS})`,
    [[...new Set(ids)], date],
  );
  return rows;
}

const he = (name: Local | null | undefined): string => name?.he ?? name?.en ?? '';

function kindOf(info: Info): string {
  switch (info.type) {
    case 'unit':
      return info.position?.at(-1)?.level ?? 'unit';
    case 'work':
      return 'sefer';
    case 'set':
      return 'shelf';
    case 'event':
      return info.kind ?? 'event';
    case 'publication':
      return 'book';
    default:
      return info.type;
  }
}

/** A unit's sefer and its place there, its own last step left out: `לקוטי שיחות · חלק יב · בא`. */
function unitSub(info: Info): string {
  const steps = (info.position ?? []).slice(0, -1).map((s) => he(s.label) || s.value);
  return [he(info.work), ...steps].filter(Boolean).join(' · ');
}

function subOf(info: Info): string {
  switch (info.type) {
    case 'unit':
      return unitSub(info);
    case 'work':
      return he(info.author);
    case 'set':
      return he(info.parent);
    case 'event':
      return info.date ? describeDateKey(info.date, 'he') : '';
    case 'recording':
      return he(info.event) || (info.date ? describeDateKey(info.date, 'he') : '');
    default:
      return info.date ? describeDateKey(info.date, 'he') : '';
  }
}

function hitOf(info: Info): SearchHit {
  return {
    id: info.id,
    type: info.type,
    kind: kindOf(info),
    title: he(info.name),
    sub: subOf(info),
    path: info.path,
    ...(info.listen ? { listen: true as const } : {}),
    ...(info.read ? { read: true as const } : {}),
  };
}

/** Where the query's words are in a snippet, to mark. */
export function marksIn(snippet: string, words: readonly string[]): Array<[number, number]> {
  const marks: Array<[number, number]> = [];
  for (const token of snippet.matchAll(/\S+/g)) {
    if (matchingWords(token[0], words).length > 0) marks.push([token.index!, token.index! + token[0].length]);
  }
  return marks;
}

/**
 * The date a query names, and its other words. The longest run of words
 * that reads as a date wins ("יו"ד שבט תשי"א" over "תשי"א"); a lone
 * number counts only when it looks like one of the Rebbe's years, so a
 * volume or a page number stays a word.
 */
export function splitDate(query: string): { date: string | null; rest: string } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  let best: { key: string; at: number; size: number; precision: number } | null = null;
  for (let size = Math.min(6, tokens.length); size >= 1; size--) {
    for (let at = 0; at + size <= tokens.length; at++) {
      const parsed = parseDateText(tokens.slice(at, at + size).join(' '));
      if (!parsed.ok) continue;
      const precision = parsed.key.split('-').length;
      if (precision === 1 && !/^5[67]\d\d$/.test(parsed.key)) continue;
      if (!best || precision > best.precision) best = { key: parsed.key, at, size, precision };
    }
  }
  if (!best) return { date: null, rest: tokens.join(' ') };
  return { date: best.key, rest: [...tokens.slice(0, best.at), ...tokens.slice(best.at + best.size)].join(' ') };
}

/** The found words as the page draws them, with what they belong to. */
function wordHitOf(moment: Moment, infos: Map<EntityId, Info>, words: readonly string[]): SearchWordHit | null {
  if (moment.kind === 'scan-line') {
    const publication = moment.publication ? infos.get(moment.publication) : undefined;
    return {
      id: moment.id,
      kind: 'scan-line',
      title: he(publication?.name),
      sub: `עמ' ${moment.page}`,
      path: `/text/${moment.scan}?page=${moment.page}&line=${encodeURIComponent(moment.line.id)}`,
      snippet: moment.line.text,
      marks: marksIn(moment.line.text, words),
      machine: moment.machine,
      opening: false,
    };
  }
  const base = { id: moment.id, kind: 'paragraph' as const, snippet: moment.snippet, marks: marksIn(moment.snippet, words), machine: moment.machine, opening: moment.opening === true };
  if (moment.textKind === 'body' && moment.unit) {
    const unit = infos.get(moment.unit);
    return { ...base, title: he(moment.name as Local) || he(unit?.name), sub: unit ? unitSub(unit) : '', path: `${moment.path ?? `/${moment.unit}`}#${moment.segment}` };
  }
  // A transcript opens at its farbrengen (else its recording) at the moment it is heard; a unit's other texts at the unit.
  const at = (moment.event && infos.get(moment.event)) || (moment.recording && infos.get(moment.recording)) || (moment.unit && infos.get(moment.unit)) || null;
  if (!at) return null;
  const t = moment.startMs !== null && at.type !== 'unit' ? `?t=${Math.floor(moment.startMs / 1000)}` : '';
  return { ...base, title: he(at.name), sub: subOf(at), path: `${at.path ?? `/${at.id}`}${t}` };
}

/** The search screen, ready to draw: see the comment at the top. */
export async function searchPage(catalog: Catalog, query: string, options: { within?: string | null } = {}): Promise<SearchPage> {
  const { date, rest } = splitDate(query);
  const within = options.within ?? date;
  const named = rest ? await namedInfo(catalog, rest, NAME_HITS) : [];
  const words = rest ? queryWords(rest) : [];
  const moments = rest ? await searchMoments(catalog, rest, { within }) : [];
  const wanted: EntityId[] = [];
  for (const m of moments) {
    if (m.kind === 'scan-line') {
      if (m.publication) wanted.push(m.publication);
    } else {
      for (const id of [m.unit, m.event, m.recording]) if (id) wanted.push(id);
    }
  }
  const found = await infoOf(catalog, wanted, date);
  const infos = new Map(found.filter((i) => !i.dated).map((i) => [i.id, i]));
  const dated = found.filter((i) => i.dated);

  const isEvent = (i: Info) => i.type === 'event' || i.type === 'recording';
  const works = named.filter((i) => !isEvent(i)).map(hitOf);
  // With words and a date, the farbrengens named that were on the date; with a date alone, the date's own.
  const namedEvents = named.filter(isEvent).filter((i) => !within || (i.date !== null && `${i.date}-`.startsWith(`${within}-`)));
  const events = (rest ? namedEvents : dated).map(hitOf);
  const wordHits = moments.map((m) => wordHitOf(m, infos, words)).filter((w): w is SearchWordHit => w !== null);

  let top: SearchHit | null = null;
  if (date && !rest) top = events[0] ?? null;
  if (!top) {
    const opening = moments.find((m) => m.kind === 'paragraph' && m.opening && m.unit);
    const unit = opening?.kind === 'paragraph' && opening.unit ? infos.get(opening.unit) : undefined;
    if (unit) top = hitOf(unit);
  }
  top ??= works[0] ?? events[0] ?? null;

  return {
    query,
    date: date ? { key: date, he: describeDateKey(date, 'he') } : null,
    within,
    top,
    works,
    events,
    words: wordHits,
  };
}

/** What to offer while someone types: names only, best first, up to six, in one statement. */
export async function searchSuggest(catalog: Catalog, query: string): Promise<SearchHit[]> {
  return (await namedInfo(catalog, query, SUGGEST_HITS)).map(hitOf);
}
