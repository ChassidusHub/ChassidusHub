import { normalizeSearchText } from '@chassidushub/hebrew';
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
 * When a hit was said, for narrowing to a year, month or day (issue #90): a
 * unit's own date, else its first event's; a paragraph's text's unit, else
 * its recording's event. A page of a scan has none (its print year is not
 * when it was said), so a narrowed search leaves pages out.
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

/** How many of the best-ranked matches are read; the rest are not read at all. */
export const MOMENT_CANDIDATES = 200;

/**
 * How many matches of each kind are ranked at most. Ranking reads each
 * match's words whole: a page or a paragraph is short, but a sicha's are
 * all its text, and a common word (שבת, גאולה) over every sicha took eight
 * to ten seconds. Past these, the first matches found are ranked.
 */
export const MOMENT_RANKED = { 'text-page': 2000, segment: 2000, unit: 400 } as const;

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
  // machine read or heard it and nobody checked, and checked words come first. A date to narrow by needs each
  // match's revision, so only a narrowed search reads it before the limit. Only MOMENT_RANKED of each kind are ranked.
  const within = options.within ?? null;
  const matched = (type: keyof typeof MOMENT_RANKED) =>
    within
      ? `(SELECT e.id FROM entity e JOIN revision r ON r.id = e.main_rev
          WHERE e.type = '${type}' AND NOT e.deleted AND e.search_tsv @@ to_tsquery('simple', $1)
            AND ((${DATE_OF}) || '-') LIKE $2 || '-%' LIMIT ${MOMENT_RANKED[type]})`
      : `(SELECT e.id FROM entity e
          WHERE e.type = '${type}' AND NOT e.deleted AND e.search_tsv @@ to_tsquery('simple', $1) LIMIT ${MOMENT_RANKED[type]})`;
  const { rows } = await catalog.db.query<{ id: EntityId; type: 'text-page' | 'segment' | 'unit' }>(
    `SELECT c.id, c.type FROM (
       SELECT e.id, e.type, e.main_rev, ts_rank(e.search_tsv, to_tsquery('simple', $1)) AS rank
       FROM (${matched('text-page')} UNION ALL ${matched('segment')} UNION ALL ${matched('unit')}) m
       JOIN entity e ON e.id = m.id
       ORDER BY rank DESC, e.id LIMIT ${MOMENT_CANDIDATES}
     ) c
     JOIN revision r ON r.id = c.main_rev
     LEFT JOIN entity l ON c.type = 'text-page' AND l.id = r.data->>'layer' LEFT JOIN revision lr ON lr.id = l.main_rev
     ORDER BY CASE
                WHEN c.type = 'text-page' THEN (coalesce(lr.data->>'kind', '') <> 'community')
                WHEN c.type = 'segment' THEN (r.data ? 'origin' AND coalesce((r.data->>'proofread')::int, 0) = 0 AND NOT coalesce((r.data->'origin'->>'checked')::boolean, FALSE))
                ELSE FALSE END,
              c.rank DESC, c.id
     LIMIT ${limit * 2}`,
    within ? [tsQuery, within] : [tsQuery],
  );
  const gate = new ExportGate(catalog);
  const pages = new Map((await pageRows(catalog, rows.filter((r) => r.type === 'text-page').map((r) => r.id))).map((r) => [r.id, r]));
  const segments = new Map((await segmentRows(catalog, rows.filter((r) => r.type === 'segment').map((r) => r.id))).map((r) => [r.id, r]));
  const units = new Map((await unitRows(catalog, rows.filter((r) => r.type === 'unit').map((r) => r.id))).map((r) => [r.id, r]));
  // A scan read by the machine and fixed by people has two pages for one page of print: the people's is shown.
  const seenPage = new Set<string>();
  const out: Moment[] = [];
  const communityFirst = [...pages.values()].sort((a, b) => Number(b.layer_kind === 'community') - Number(a.layer_kind === 'community'));
  const shownPage = new Map<string, EntityId>();
  for (const p of communityFirst) {
    const key = `${p.scan}:${p.page}`;
    if (!shownPage.has(key)) shownPage.set(key, p.id);
  }
  for (const r of rows) {
    if (out.length >= limit) break;
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
  // A maamar or sicha that opens with the words asked is what was looked for: first, in the order found.
  const opens = (m: Moment) => m.kind === 'paragraph' && m.opening === true;
  return [...out.filter(opens), ...out.filter((m) => !opens(m))];
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
