import { describeDateKey, normalizeSearchText } from '@chassidushub/hebrew';
import { mayExport, type EntityId, type PageSegment, type PageText, type RightsState, type TextData, type TextLine } from '@chassidushub/model';
import type { Catalog, EntityView } from './catalog.js';
import { ExportGate } from './gate.js';
import { toTsQuery } from './searchText.js';

/**
 * Search that lands on the moment (the plan, section 9: "hits open the
 * scan at the highlighted line, or the recording at the spoken moment").
 * The built-in search finds the pages of scans and the paragraphs of
 * texts whose words match; each is turned into the place a reader should
 * open: the line on a scan's page, or the paragraph of a recording's
 * transcript with the time it is heard. What a machine read or heard and
 * nobody has checked says so. Words whose rights forbid copies are left
 * out, as everywhere else.
 */

/** A found line on a scan's page: open `/text/<scan>?page=<page>` at `line`. */
export interface ScanLineMoment {
  kind: 'scan-line';
  /** The text page found (community or machine). */
  id: EntityId;
  scan: EntityId;
  publication: EntityId | null;
  page: number;
  line: { id: string; text: string };
  /** The words of the line that match, as written there, to mark. */
  hits: string[];
  /** Still as the machine read it: nobody has checked this line. */
  machine: boolean;
}

/**
 * A found paragraph of a text: a transcript's, with where it is heard, or a
 * unit's. A paragraph of a sefer's own words (a unit's `body`: a maamar, a
 * sicha, a letter, as the Chabad Library or Sichos-Kodesh gave it) has
 * `textKind: 'body'`, the unit as its `id`, `text` and `unit`, and the
 * paragraph's id within the body as `segment` (issue #88).
 */
export interface ParagraphMoment {
  kind: 'paragraph';
  /** The segment found; for a body, the unit. */
  id: EntityId;
  text: EntityId;
  /** transcript, edition, hanacha, translation; or body. */
  textKind: string;
  /** A body's paragraph, by its id within the body. */
  segment?: string;
  /** A body's unit: its page and its name. */
  path?: string | null;
  name?: unknown;
  /** The query is how the unit's words begin, a maamar's ד"ה: shown first (issue #90). */
  opening?: boolean;
  unit: EntityId | null;
  recording: EntityId | null;
  event: EntityId | null;
  /** Where in the recording it is heard, when the transcript is synced. */
  startMs: number | null;
  /** The words around the match. */
  snippet: string;
  hits: string[];
  machine: boolean;
}

export type Moment = ScanLineMoment | ParagraphMoment;

/** The query's words as the index holds them. */
export function queryWords(query: string): string[] {
  return normalizeSearchText(query)
    .split(' ')
    .filter((w) => w.length > 0)
    .slice(0, 12);
}

/** The words of `text` (as written) that match the query's words, each as a prefix, as the search does. */
export function matchingWords(text: string, words: readonly string[]): string[] {
  if (words.length === 0) return [];
  return text.split(/\s+/).filter((token) => {
    const norm = normalizeSearchText(token);
    return norm.length > 0 && norm.split(' ').some((part) => words.some((w) => part.startsWith(w)));
  });
}

/** The line of a page that answers the query best: the one with most of its words; the first such. */
export function bestLine<T extends { text: string }>(lines: readonly T[], words: readonly string[]): { line: T; hits: string[] } | null {
  let best: { line: T; hits: string[]; score: number } | null = null;
  for (const line of lines) {
    const hits = matchingWords(line.text, words);
    const found = new Set(words.filter((w) => hits.some((h) => normalizeSearchText(h).split(' ').some((p) => p.startsWith(w)))));
    if (found.size > 0 && (!best || found.size > best.score)) best = { line, hits, score: found.size };
  }
  return best ? { line: best.line, hits: best.hits } : null;
}

/** About `size` words of `content` around its first match, with an ellipsis where it was cut. */
export function snippetOf(content: string, words: readonly string[], size = 40): string {
  const tokens = content.split(/\s+/).filter(Boolean);
  if (tokens.length <= size) return tokens.join(' ');
  const first = tokens.findIndex((t) => matchingWords(t, words).length > 0);
  const start = Math.max(0, (first < 0 ? 0 : first) - Math.floor(size / 3));
  const end = Math.min(tokens.length, start + size);
  return `${start > 0 ? '… ' : ''}${tokens.slice(start, end).join(' ')}${end < tokens.length ? ' …' : ''}`;
}

interface PageRow {
  id: EntityId;
  layer: EntityId;
  page: number;
  lines: Array<TextLine>;
  layer_kind: string;
  scan: EntityId;
  publication: EntityId | null;
  /** The rights of the scan's file, null when it has none: whether its pages' words may be shown. */
  rights: RightsState | null;
}

interface SegmentRow {
  id: EntityId;
  text: EntityId;
  content: string;
  proofread: number;
  checked: boolean | null;
  text_kind: string;
  /** The text's licence: whether its words may be shown. */
  licence: string | null;
  unit: EntityId | null;
  recording: EntityId | null;
  event: EntityId | null;
  start_ms: string | null;
}

/** The moment an item found by search stands for, or null when it is not a page of a scan or a paragraph (or its words are withheld). */
export async function momentOf(catalog: Catalog, view: EntityView, words: readonly string[], gate = new ExportGate(catalog)): Promise<Moment | null> {
  if (view.type === 'text-page') {
    const [row] = await pageRows(catalog, [view.id]);
    return row ? pageMoment(row, words, gate) : null;
  }
  if (view.type === 'segment') {
    const [row] = await segmentRows(catalog, [view.id]);
    return row ? segmentMoment(row, words, gate) : null;
  }
  return null;
}

async function pageRows(catalog: Catalog, ids: readonly EntityId[]): Promise<PageRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await catalog.db.query<PageRow>(
    `SELECT p.id, pr.data->>'layer' AS layer, (pr.data->>'page')::int AS page, pr.data->'lines' AS lines,
            lr.data->>'kind' AS layer_kind, lr.data->>'scan' AS scan, sr.data->>'publication' AS publication, f.rights_state AS rights
     FROM entity p JOIN revision pr ON pr.id = p.main_rev
     JOIN entity l ON l.id = pr.data->>'layer' JOIN revision lr ON lr.id = l.main_rev
     LEFT JOIN entity s ON s.id = lr.data->>'scan' LEFT JOIN revision sr ON sr.id = s.main_rev
     LEFT JOIN file f ON f.sha256 = sr.data->>'file'
     WHERE p.id = ANY($1::text[]) AND p.type = 'text-page' AND NOT p.deleted`,
    [ids],
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

async function segmentRows(catalog: Catalog, ids: readonly EntityId[]): Promise<SegmentRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await catalog.db.query<SegmentRow>(
    `SELECT s.id, sr.data->>'text' AS text, sr.data->>'content' AS content, coalesce((sr.data->>'proofread')::int, 0) AS proofread,
            (sr.data->'origin'->>'checked')::boolean AS checked, tr.data->>'kind' AS text_kind, tr.data->>'licence' AS licence,
            tr.data->>'unit' AS unit, tr.data->>'recording' AS recording, rr.data->>'event' AS event,
            (SELECT spr.data->>'startMs' FROM entity_ref y JOIN entity sp ON sp.id = y.from_id AND sp.type = 'alignment-span' AND NOT sp.deleted
               JOIN revision spr ON spr.id = sp.main_rev WHERE y.to_id = s.id AND y.field = 'segment' LIMIT 1) AS start_ms
     FROM entity s JOIN revision sr ON sr.id = s.main_rev
     JOIN entity t ON t.id = sr.data->>'text' JOIN revision tr ON tr.id = t.main_rev
     LEFT JOIN entity r ON r.id = tr.data->>'recording' LEFT JOIN revision rr ON rr.id = r.main_rev
     WHERE s.id = ANY($1::text[]) AND s.type = 'segment' AND NOT s.deleted`,
    [ids],
  );
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

async function pageMoment(row: PageRow, words: readonly string[], gate: ExportGate): Promise<ScanLineMoment | null> {
  if (await gate.layerWithheld(row.layer, row.rights)) return null;
  const lines = row.lines ?? [];
  const best = bestLine(lines, words) ?? (lines[0] ? { line: lines[0], hits: [] } : null);
  if (!best) return null;
  return {
    kind: 'scan-line',
    id: row.id,
    scan: row.scan,
    publication: row.publication,
    page: row.page,
    line: { id: best.line.id, text: best.line.text },
    hits: best.hits,
    machine: row.layer_kind !== 'community' || (best.line.proofread ?? 0) === 0,
  };
}

async function segmentMoment(row: SegmentRow, words: readonly string[], gate: ExportGate): Promise<ParagraphMoment | null> {
  if (await gate.textWithheld(row.text, { licence: row.licence ?? undefined } as TextData)) return null;
  return {
    kind: 'paragraph',
    id: row.id,
    text: row.text,
    textKind: row.text_kind,
    unit: row.unit,
    recording: row.recording,
    event: row.event,
    startMs: row.start_ms === null ? null : Number(row.start_ms),
    snippet: snippetOf(row.content ?? '', words),
    hits: matchingWords(row.content ?? '', words),
    machine: row.proofread === 0 && !row.checked,
  };
}

/**
 * When a hit was said, for putting a year, month or day first (issues #90,
 * #167): a unit's own date, else its first event's; a paragraph's text's
 * unit, else its recording's event. A page of a scan has none (its print
 * year is not when it was said).
 */
const DATE_OF = `CASE e.type
  WHEN 'unit' THEN coalesce(r.data->>'date', (SELECT vr.data->>'date' FROM entity v JOIN revision vr ON vr.id = v.main_rev WHERE v.id = r.data->'events'->>0))
  WHEN 'segment' THEN (SELECT coalesce(ur.data->>'date', vr.data->>'date')
    FROM entity t JOIN revision tr ON tr.id = t.main_rev
    LEFT JOIN entity u ON u.id = tr.data->>'unit' LEFT JOIN revision ur ON ur.id = u.main_rev
    LEFT JOIN entity g ON g.id = tr.data->>'recording' LEFT JOIN revision gr ON gr.id = g.main_rev
    LEFT JOIN entity v ON v.id = gr.data->>'event' LEFT JOIN revision vr ON vr.id = v.main_rev
    WHERE t.id = r.data->>'text')
  END`;

/**
 * A year as its own words say it, as a tsquery: `תשי"א` or `ה'תשי"א`, as a
 * maamar's heading dates it (בס"ד, יו"ד שבט, ה'תשי"א) when the item itself
 * carries no date (#167).
 */
export function yearWordsQuery(within: string): string {
  const year = normalizeSearchText(describeDateKey(within.slice(0, 4), 'he'));
  return `${year} | ה${year}`;
}

/**
 * How many of the best-ranked matches are read; the rest are not read at all. Each one's revision is read from disk
 * on a cold search, to put checked words first: 80 is four pages of results, and took 100 ms less than 200 (#214).
 */
export const MOMENT_CANDIDATES = 80;

/**
 * How many matches of each kind are ranked at most. Ranking reads each
 * match's words: a page's are some 4 KB, a paragraph's 1, and a sicha is
 * ranked on its lead (unit_place.lead, migration 0033: its name and its
 * first few hundred words), never on all its 80 KB. Finding the matches
 * reads words too: sichos are found first by their lead, through its index
 * (MOMENT_LEADS, migration 0035), reading no sicha's words; then only 20
 * that say the words further in are found by reading each one's words whole
 * (a common word is in most of them, so the database reads them in turn
 * rather than through the index; 400 read 30 MB on a first search, #182).
 * Past these, the first matches found are ranked. Each match is ranked where
 * it is found, so its words are read once. A paragraph's row is read from disk
 * to rank it on a cold search: 300 took 100-200 ms less than 1000 (#214).
 */
export const MOMENT_RANKED = { 'text-page': 300, segment: 300, unit: 20 } as const;

/** How many sichos whose lead holds the query are found through the lead's index, and ranked on it. */
export const MOMENT_LEADS = 40;

/**
 * The places in scans and texts where the query's words are: lines on
 * scans' pages and paragraphs of texts and transcripts, best first.
 */
export async function searchMoments(catalog: Catalog, query: string, options: { limit?: number; within?: string | null } = {}): Promise<Moment[]> {
  const tsQuery = toTsQuery(query);
  if (!tsQuery) return [];
  const words = queryWords(query);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  // Ranked in two steps, so a common word does not unpack every page that has it: the best matches by rank, read
  // from the entity row and its index alone (MOMENT_CANDIDATES); then, for those only, the revision says whether a
  // machine read or heard it and nobody checked, and checked words come first. Only MOMENT_RANKED of each kind are
  // ranked. A date (`within`) puts first the matches said then, or whose own words name its year (a maamar's heading),
  // then the rest: that needs each such match's revision, so only a search with a date reads it before the limit.
  // A scan page's layer comes from its link (entity_ref), not its revision, which holds all the page's lines (#182).
  const within = options.within ?? null;
  // A sicha is ranked on its lead, a sicha outside a sefer (no unit_place row) last; the rest on their words.
  const rank = (type: keyof typeof MOMENT_RANKED) =>
    type === 'unit'
      ? `coalesce((SELECT ts_rank(p.lead, to_tsquery('simple', $1)) FROM unit_place p WHERE p.unit_id = e.id), 0)`
      : `ts_rank(e.search_tsv, to_tsquery('simple', $1))`;
  // Each kind's own live rows are tested for the words, and in plain sight: a word few items have is then found through
  // the words' index (entity_search_tsv), a common one through the type index (entity_type, which holds the live rows
  // only, hence main_rev IS NOT NULL) or by reading the rows in turn. The type is asked as `= ANY`, not `=`: the planner
  // tests a plain `type = '…'` last, after the words, and so read every page's words while looking for paragraphs; and
  // hidden in a CASE, as #204 had it, the words' index could not be used, so a rare word read every page's words (#182).
  const has = (type: keyof typeof MOMENT_RANKED, query = '$1') =>
    `e.type = ANY ('{${type}}'::text[]) AND NOT e.deleted AND e.main_rev IS NOT NULL AND e.search_tsv @@ to_tsquery('simple', ${query})`;
  const all = (type: keyof typeof MOMENT_RANKED, tier: number) =>
    `(SELECT e.id, e.type, e.main_rev, ${rank(type)} AS rank, ${tier} AS tier FROM entity e
          WHERE ${has(type)} LIMIT ${MOMENT_RANKED[type]})`;
  const ofDate = (type: keyof typeof MOMENT_RANKED) =>
    `(SELECT e.id, e.type, e.main_rev, ${rank(type)} AS rank, 0 AS tier FROM entity e JOIN revision r ON r.id = e.main_rev
          WHERE ${has(type)}
            AND (((${DATE_OF}) || '-') LIKE $2 || '-%' OR e.search_tsv @@ to_tsquery('simple', $3)) LIMIT ${MOMENT_RANKED[type]})`;
  // The sichos that open on the words, found through the lead's index without reading their words (#182). The first
  // MOMENT_LEADS leads found are taken before the join, so a word in most leads stops there rather than sorting them all
  // for a join; then each sicha is found by its own id (one collation since migration 0036, so either key finds it), one lookup a lead:
  // as a plain join the planner merged the leads with every sicha in the type index instead (#214).
  const leads = (tier: number) =>
    `(SELECT e.id, e.type, e.main_rev, p.rank, ${tier} AS tier
          FROM (SELECT unit_id, ts_rank(lead, to_tsquery('simple', $1)) AS rank FROM unit_place
                WHERE lead @@ to_tsquery('simple', $1) LIMIT ${MOMENT_LEADS}) p
          CROSS JOIN LATERAL (SELECT e.id, e.type, e.main_rev FROM entity e
                WHERE e.id = p.unit_id AND e.type = 'unit' AND NOT e.deleted AND e.main_rev IS NOT NULL OFFSET 0) e)`;
  const kinds = ['text-page', 'segment', 'unit'] as const;
  const matched = within ? [...kinds.map(ofDate), ...kinds.map((k) => all(k, 1)), leads(1)] : [...kinds.map((k) => all(k, 0)), leads(0)];
  const { rows } = await catalog.db.query<{ id: EntityId; type: 'text-page' | 'segment' | 'unit'; tier: number }>(
    `SELECT c.id, c.type, c.tier FROM (
       SELECT id, type, main_rev, min(tier) AS tier, max(rank) AS rank
       FROM (${matched.join(' UNION ALL ')}) u GROUP BY id, type, main_rev
       ORDER BY tier, rank DESC, id LIMIT ${MOMENT_CANDIDATES}
     ) c
     -- Only a paragraph's revision says whether a machine wrote it unchecked; a page's and a sicha's are not read (#214).
     LEFT JOIN LATERAL (SELECT r.data FROM revision r WHERE r.id = c.main_rev AND c.type = 'segment' OFFSET 0) r ON TRUE
     LEFT JOIN entity_ref y ON c.type = 'text-page' AND y.from_id = c.id AND y.field = 'layer'
     LEFT JOIN entity l ON l.id = y.to_id LEFT JOIN revision lr ON lr.id = l.main_rev
     ORDER BY c.tier,
              CASE
                WHEN c.type = 'text-page' THEN (coalesce(lr.data->>'kind', '') <> 'community')
                WHEN c.type = 'segment' THEN (r.data ? 'origin' AND coalesce((r.data->>'proofread')::int, 0) = 0 AND NOT coalesce((r.data->'origin'->>'checked')::boolean, FALSE))
                ELSE FALSE END,
              c.rank DESC, c.id
     LIMIT ${limit * 2}`,
    within ? [tsQuery, within, yearWordsQuery(within)] : [tsQuery],
  );
  const gate = new ExportGate(catalog);
  const pages = new Map((await pageRows(catalog, rows.filter((r) => r.type === 'text-page').map((r) => r.id))).map((r) => [r.id, r]));
  const segments = new Map((await segmentRows(catalog, rows.filter((r) => r.type === 'segment').map((r) => r.id))).map((r) => [r.id, r]));
  // A sicha's words are all its text: those of the first `limit` matches are read now, the rest only if some of those
  // show nothing (withheld, or no paragraph holds the words), so a common word reads twenty sichos, not forty (#182).
  const unitIds = (from: typeof rows) => from.filter((r) => r.type === 'unit').map((r) => r.id);
  const units = new Map((await unitRows(catalog, unitIds(rows.slice(0, limit)))).map((r) => [r.id, r]));
  let unitsRead = Math.min(limit, rows.length);
  // A scan read by the machine and fixed by people has two pages for one page of print: the people's is shown.
  const seenPage = new Set<string>();
  const out: Moment[] = [];
  const communityFirst = [...pages.values()].sort((a, b) => Number(b.layer_kind === 'community') - Number(a.layer_kind === 'community'));
  const shownPage = new Map<string, EntityId>();
  for (const p of communityFirst) {
    const key = `${p.scan}:${p.page}`;
    if (!shownPage.has(key)) shownPage.set(key, p.id);
  }
  for (const [i, r] of rows.entries()) {
    if (out.length >= limit) break;
    if (i >= unitsRead) {
      for (const row of await unitRows(catalog, unitIds(rows.slice(i)))) units.set(row.id, row);
      unitsRead = rows.length;
    }
    if (r.type === 'text-page') {
      const row = pages.get(r.id);
      if (!row) continue;
      const key = `${row.scan}:${row.page}`;
      if (seenPage.has(key) || shownPage.get(key) !== row.id) continue;
      seenPage.add(key);
      const moment = await pageMoment(row, words, gate);
      if (moment) out.push(moment);
    } else if (r.type === 'unit') {
      const row = units.get(r.id);
      const moment = row ? unitMoment(row, words) : null;
      if (moment) out.push(moment);
    } else {
      const row = segments.get(r.id);
      const moment = row ? await segmentMoment(row, words, gate) : null;
      if (moment) out.push(moment);
    }
  }
  // A maamar or sicha that opens with the words asked is what was looked for: first, in the order found, after
  // the date's own (a moment's id is its match's).
  const opens = (m: Moment) => m.kind === 'paragraph' && m.opening === true;
  const tier = new Map(rows.map((r) => [r.id, Number(r.tier)]));
  const ofTier = (t: number) => out.filter((m) => (tier.get(m.id) ?? 0) === t);
  return [0, 1].flatMap((t) => [...ofTier(t).filter(opens), ...ofTier(t).filter((m) => !opens(m))]);
}

interface UnitRow {
  id: EntityId;
  path: string | null;
  label: unknown;
  body: PageText | null;
  rights: RightsState | null;
}

async function unitRows(catalog: Catalog, ids: readonly EntityId[]): Promise<UnitRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await catalog.db.query<UnitRow>(
    `SELECT e.id, e.path, r.data->'label' AS label, r.data->'body' AS body, r.data->'bodySource'->>'rights' AS rights
     FROM entity e JOIN revision r ON r.id = e.main_rev WHERE e.id = ANY($1::text[]) AND e.type = 'unit' AND NOT e.deleted`,
    [ids],
  );
  return rows;
}

/** The words of a body segment as one line, its children's too. */
function segmentWords(segment: PageSegment): string {
  const own = (segment.text ?? []).map((run) => ('text' in run && typeof run.text === 'string' ? run.text : '')).join('');
  return [own, ...(segment.children ?? []).map(segmentWords)].filter(Boolean).join(' ');
}

/** The paragraph of a unit's words that holds the query best, or null when its words are withheld or none holds it. */
function unitMoment(row: UnitRow, words: readonly string[]): ParagraphMoment | null {
  if (!row.body || (row.rights && !mayExport(row.rights))) return null;
  const version = row.body.versions?.[0];
  if (!version) return null;
  const lines = version.segments.map((s) => ({ id: s.id, text: segmentWords(s), origin: s.origin ?? version.origin, kind: s.kind }));
  const best = bestLine(lines, words);
  if (!best) return null;
  // Opening: the first paragraph (after any heading) begins with the query's words.
  const first = lines.find((l) => l.kind !== 'heading' && l.text.trim());
  const opening = first?.id === best.line.id && normalizeSearchText(first.text).startsWith(words.join(' '));
  return {
    kind: 'paragraph',
    id: row.id,
    text: row.id,
    textKind: 'body',
    unit: row.id,
    recording: null,
    event: null,
    startMs: null,
    segment: best.line.id,
    path: row.path,
    name: row.label,
    opening,
    snippet: snippetOf(best.line.text, words),
    hits: best.hits,
    machine: Boolean(best.line.origin && !best.line.origin.checked),
  };
}
