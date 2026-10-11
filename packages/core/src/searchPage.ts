import { describeDateKey, normalizeSearchText, parseDateText } from '@chassidushub/hebrew';
import type { EntityId, EntityType, Language } from '@chassidushub/model';
import type { Catalog } from './catalog.js';
import { matchingWords, queryWords, searchMoments, type Moment } from './moments.js';
import { languageSql, languageTitleWords, splitLanguage } from './language.js';
import { parshaDays, parshaHe, parshaOf } from './parsha.js';
import { topicOf } from './topics.js';
import { NAME_SQL, nameTierSql, NAMES, normalizedSql, toTsQuery } from './searchText.js';

/**
 * The new site's search screen in one read (apps/www): everything the page
 * shows, ready to draw, in at most six statements. Sefarim, shelves and
 * sichos the words name; the farbrengens and recordings they name, or that
 * were on the date they give; and the places in the words themselves,
 * each opening at its paragraph, line or moment. A date in the query
 * ("תשי"א", "יו"ד שבט תשי"א") is taken as the date, not as words: the
 * words said in that year, month or day come first, then the rest (#167),
 * and alone it finds that day's farbrengen. Words that are a parsha's name and nothing else
 * ("תצוה", "פרשת בשלח תשמ"ב") are also the farbrengens of its weeks, in the
 * year given or in every year. Titles and the line under them are in
 * Hebrew, as the site shows them.
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
  /** The languages it is in, when any is not Hebrew (a translation, a sefer in English): for a language mark. */
  languages?: string[];
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
  /** The language asked for: "in English" in the words, or `language`. Names are only those in it. */
  language: string | null;
  /** The parsha the words are, when they are a parsha's name and nothing else: hebcal's name and the Hebrew. */
  parsha: { key: string; he: string } | null;
  /**
   * The subject the words are in English letters (`bitachon`), and the Hebrew searched for instead (`בטחון`), from a
   * small list people keep (topics.ts); else null.
   */
  topic: { key: string; he: string } | null;
  /** The date whose words come first: the `within` asked for, else the query's date. */
  within: string | null;
  /** What the person most likely wants: the day's farbrengen, a maamar that opens with the words, else the best name. */
  top: SearchHit | null;
  works: SearchHit[];
  events: SearchHit[];
  words: SearchWordHit[];
  /**
   * Entries of a subject index the words name (בטחון: Likkutei Sichos' index entry, with how many places it lists),
   * each opening that entry; from what the scheduled run keeps, so none when nothing is kept yet (#99).
   */
  subjects: SearchSubjectHit[];
}

export interface SearchSubjectHit {
  /** The index's name, as the catalog has it. */
  index: Local | null;
  topic: string;
  places: number;
  volumes: number;
  /** A machine read some of the entry from the printed index, and no person has checked it. */
  machine: boolean;
  /** The site's page of that entry. */
  path: string;
}

/**
 * The kinds of item a name search lists; the words themselves come as `words`. A sicha or maamar is not
 * among them: what it is found by holds all its words, so ranking it here would unpack every one that
 * has a common word (#124). It comes as `words`, and first when it opens with them; and by its own name
 * (namedInfo), from its place.
 */
const NAMED: EntityType[] = ['set', 'work', 'event', 'recording', 'publication', 'author'];
const NAME_HITS = 30;
const DATED_HITS = 20;
/** A parsha's farbrengens over all the years are many: more of them are listed. */
const PARSHA_HITS = 60;
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
  languages: string[] | null;
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
    WHEN 'event' THEN EXISTS (SELECT 1 FROM entity_ref y JOIN entity ge ON ge.id = y.from_id WHERE y.to_id = e.id AND y.field = 'event' AND ge.type = 'recording' AND NOT ge.deleted)
    ELSE FALSE END AS listen,
  CASE e.type WHEN 'unit' THEN r.data ? 'body'
    WHEN 'event' THEN coalesce(r.data->'links' @> '[{"kind":"mugah"}]' OR r.data->'links' @> '[{"kind":"bilti-mugah"}]', FALSE)
    ELSE FALSE END AS read,
  ARRAY(SELECT DISTINCT l FROM (
      SELECT x->>'language' AS l FROM jsonb_array_elements(CASE jsonb_typeof(r.data->'sourceCopies') WHEN 'array' THEN r.data->'sourceCopies' ELSE '[]' END) x
      UNION ALL SELECT x->>'language' FROM jsonb_array_elements(CASE jsonb_typeof(r.data->'editions') WHEN 'array' THEN r.data->'editions' ELSE '[]' END) x
      UNION ALL SELECT r.data->>'language') ls WHERE l IS NOT NULL ORDER BY l) AS languages`;

/** An item's names in Hebrew and English together, as the search compares them. */

/**
 * Items found by name, best first, with their facts: one statement. With a language, only those in it.
 * `typed` is the words as typed, filler and all, that a name is compared whole with (splitLanguage).
 * A sicha or maamar is found by its own name too (`דברים ב`, `Devarim 2`), from its place (unit_place's
 * indexed names, migration 0032) and never its words; a sefer's name comes before a sicha's as good.
 */
async function namedInfo(catalog: Catalog, query: string, limit: number, language: Language | null = null, typed: string = query): Promise<Info[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];
  const typedAt = language ? '$6' : '$4';
  const { rows } = await catalog.db.query<Info>(
    // Ranked first, then the facts read for the few kept. Only a sefer's or shelf's revision is read while ranking (its
    // names' tier, and whether it is an addition): a common word is in thousands of farbrengens and recordings, and
    // reading each one's revision to rank it was most of a first search (#182). OFFSET 0 keeps the planner from joining
    // every match's revision anyway.
    `WITH named AS (
       SELECT e.id, CASE WHEN e.type NOT IN ('work', 'set') THEN 3 ELSE ${nameTierSql(NAMES.map(normalizedSql), '$2', '$1', typedAt)} END AS tier,
              (e.type = 'work' AND r.data ? 'addition') AS addition, 0 AS src, ts_rank(e.search_tsv, to_tsquery('simple', $1)) AS rank,
              e.path COLLATE "C" AS k1, ''::text COLLATE "C" AS k2
       FROM entity e LEFT JOIN LATERAL (SELECT r.data FROM revision r WHERE r.id = e.main_rev AND ${language ? 'TRUE' : `e.type IN ('work', 'set')`} OFFSET 0) r ON TRUE
       WHERE e.search_tsv @@ to_tsquery('simple', $1) AND NOT e.deleted AND e.main_rev IS NOT NULL AND e.type = ANY($3::text[])
         ${language ? `AND ${languageSql('$4::text', '$5', NAME_SQL)}` : ''}
       ORDER BY tier, addition, rank DESC, e.path LIMIT ${limit}),
     unit AS (
       SELECT p.unit_id COLLATE "default" AS id, ${nameTierSql(['p.name_he', 'p.name_en'], '$2', '$1', typedAt)} AS tier,
              FALSE AS addition, 1 AS src, 0::real AS rank, p.work_id COLLATE "C" AS k1, p.ord AS k2
       FROM unit_place p
       WHERE ${language ? 'FALSE' : `p.names @@ to_tsquery('simple', $1)`}
       ORDER BY tier, p.work_id, p.ord LIMIT ${limit}),
     hit AS (
       SELECT id, row_number() OVER (ORDER BY tier, addition, src, rank DESC, k1, k2) AS n
       FROM (SELECT * FROM named UNION ALL SELECT * FROM unit) u ORDER BY n LIMIT ${limit})
     SELECT ${INFO} FROM hit JOIN entity e ON e.id = hit.id JOIN revision r ON r.id = e.main_rev ORDER BY hit.n`,
    language
      ? [tsQuery, normalizeSearchText(query), NAMED, language, languageTitleWords(language), normalizeSearchText(typed)]
      : [tsQuery, normalizeSearchText(query), NAMED, normalizeSearchText(typed)],
  );
  return rows;
}

/**
 * Items by id (what the found words belong to), and the events on a date or on a parsha's days, with their
 * facts: one statement.
 */
async function infoOf(catalog: Catalog, ids: readonly EntityId[], date: string | null, days: readonly string[] = []): Promise<Info[]> {
  if (ids.length === 0 && !date && days.length === 0) return [];
  const { rows } = await catalog.db.query<Info>(
    `(SELECT ${INFO}, FALSE AS dated FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND NOT e.deleted)
     UNION ALL
     (SELECT ${INFO}, TRUE AS dated FROM entity e JOIN revision r ON r.id = e.main_rev
      WHERE e.type = 'event' AND NOT e.deleted
        AND (${days.length > 0 ? `r.data->>'date' = ANY($2::text[])` : `$2::text IS NOT NULL AND (r.data->>'date' || '-') LIKE $2 || '-%'`})
      ORDER BY (r.data->>'kind' <> 'farbrengen'), r.data->>'date' COLLATE "C", coalesce((r.data->>'order')::int, 0), e.id
      LIMIT ${days.length > 0 ? PARSHA_HITS : DATED_HITS})`,
    [[...new Set(ids)], days.length > 0 ? [...days] : date],
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
    ...(info.languages?.some((l) => l !== 'he') ? { languages: info.languages } : {}),
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
export async function searchPage(
  catalog: Catalog,
  query: string,
  options: {
    within?: string | null;
    language?: Language | null;
    /** The subject index entries the words name (the API reads them from what is kept; no statement). */
    subjects?: (words: string) => Promise<SearchSubjectHit[]>;
  } = {},
): Promise<SearchPage> {
  const split = splitDate(query);
  const date = split.date;
  // "in English" is a filter, not words; so are the small words of a question.
  const said = splitLanguage(split.rest);
  const rest = said.rest;
  const language = options.language ?? said.language;
  const within = options.within ?? date;
  // A parsha is its weeks within the date given (a year, a month), else in every year.
  const parsha = rest ? parshaOf(rest) : null;
  const days = parsha ? parshaDays(parsha, within ? Number(within.slice(0, 4)) : null).filter((d) => !within || `${d}-`.startsWith(`${within}-`)) : [];
  // A subject in English letters (bitachon) is looked for as the texts write it (בטחון), names and words alike.
  const topic = rest && !parsha ? topicOf(rest) : null;
  const look = topic?.he ?? rest;
  // An index entry names a subject, not a date: asked beside the statements, never with a date or language.
  const subjects = look && !date && !language && options.subjects ? options.subjects(look).catch(() => []) : Promise.resolve([]);
  const named = look ? await namedInfo(catalog, look, NAME_HITS, language, topic ? look : said.typed) : [];
  const words = look ? queryWords(look) : [];
  const moments = look ? await searchMoments(catalog, look, { within }) : [];
  const wanted: EntityId[] = [];
  for (const m of moments) {
    if (m.kind === 'scan-line') {
      if (m.publication) wanted.push(m.publication);
    } else {
      for (const id of [m.unit, m.event, m.recording]) if (id) wanted.push(id);
    }
  }
  const found = await infoOf(catalog, wanted, date, days);
  const infos = new Map(found.filter((i) => !i.dated).map((i) => [i.id, i]));
  const dated = found.filter((i) => i.dated);

  const isEvent = (i: Info) => i.type === 'event' || i.type === 'recording';
  const works = named.filter((i) => !isEvent(i)).map(hitOf);
  // With words and a date, the farbrengens named that were on the date; with a date alone, the date's own;
  // with a parsha, its weeks' farbrengens, then any others named.
  const namedEvents = named.filter(isEvent).filter((i) => !within || (i.date !== null && `${i.date}-`.startsWith(`${within}-`)));
  const ofParsha = new Set(dated.map((i) => i.id));
  const events = (days.length > 0 ? [...dated, ...namedEvents.filter((i) => !ofParsha.has(i.id))] : rest ? namedEvents : dated).map(hitOf);
  const wordHits = moments.map((m) => wordHitOf(m, infos, words)).filter((w): w is SearchWordHit => w !== null);

  let top: SearchHit | null = null;
  if (date && !rest) top = events[0] ?? null;
  if (!top) {
    const opening = moments.find((m) => m.kind === 'paragraph' && m.opening && m.unit);
    const unit = opening?.kind === 'paragraph' && opening.unit ? infos.get(opening.unit) : undefined;
    if (unit) top = hitOf(unit);
  }
  top ??= (days.length > 0 ? events[0] : undefined) ?? works[0] ?? events[0] ?? null;

  return {
    query,
    date: date ? { key: date, he: describeDateKey(date, 'he') } : null,
    language,
    parsha: parsha && days.length > 0 ? { key: parsha, he: parshaHe(parsha) } : null,
    topic,
    within,
    top,
    works,
    events,
    words: wordHits,
    subjects: await subjects,
  };
}

/** What to offer while someone types: names only, best first, up to six, in one statement. */
export async function searchSuggest(catalog: Catalog, query: string): Promise<SearchHit[]> {
  const { language, rest, typed } = splitLanguage(query);
  return (await namedInfo(catalog, rest, SUGGEST_HITS, language, typed)).map(hitOf);
}
