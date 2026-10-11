import { mayServe, type EntityId, type MachineOrigin, type PageSegment, type PageText, type RightsState, type TextData, type TextProfile } from '@chassidushub/model';
import type { Catalog, EntityView } from './catalog.js';
import { pdfPagesOf } from './compare.js';
import { ExportGate } from './gate.js';
import type { Json } from './merge.js';
import { pathBar, type PathLevel } from './pathBar.js';

/**
 * One read for one page of the new site (apps/www): an item and
 * everything its page draws, ready to draw. That is its path bar, the
 * units before and after it, and the best words there are for it: its
 * own words, else a text of it the catalog keeps, else the pages of a
 * scan it is printed on. Each part is marked machine or checked. The
 * site makes one request for a page and the database answers it in six
 * statements at most (a unit with words of its own takes four).
 */

/** Machine words shown, labelled until a person checks them: none, some or all of them. */
export type MachineShare = 'none' | 'some' | 'all';

/** The words a page shows, in one shape whatever they came from. */
export type ShownText =
  | {
      kind: 'words';
      /** The item's own words (`body`), or a text of it (`text`, its id in `text`). */
      from: 'body' | 'text';
      text?: EntityId;
      /** Which of the item's versions is shown: its id within the body, or the text's id. */
      version: string;
      language: string;
      profile: TextProfile;
      title?: string;
      credit?: string;
      licence?: string;
      /** Where the words are read at their source. */
      url?: string;
      /** Segments, each with `origin` while a machine's words wait for a person. */
      segments: PageSegment[];
      notes: PageSegment[];
      machine: MachineShare;
      /** Every version there is to switch to, this one among them. */
      versions: Array<{ version: string; from: 'body' | 'text'; language: string; title?: string }>;
    }
  | {
      kind: 'pages';
      /** The scan and its file (served at /v1/files/{sha256}) with the PDF pages that hold the item. */
      scan: EntityId;
      file: string;
      firstPage: number;
      lastPage: number;
      publication: EntityId;
    }
  | { kind: 'withheld'; reason: string; url?: string };

export interface ItemView {
  /** The item's facts, without its words (they are in `text`). */
  item: EntityView;
  /** Set when the path asked was an old one: the item's path now. */
  movedTo?: string;
  pathBar: PathLevel[];
  previous: Brief | null;
  next: Brief | null;
  text: ShownText | null;
}

interface Brief {
  id: EntityId;
  path: string | null;
  name: Json | null;
}

const brief = (v: EntityView | null): Brief | null => (v ? { id: v.id, path: v.path, name: (v.data as { label?: Json }).label ?? null } : null);

/** Whether words a machine made still wait for a person. */
const unchecked = (origin: MachineOrigin | undefined, proofread?: number) => Boolean(origin && !origin.checked && !(proofread && proofread > 0));

function share(flags: boolean[]): MachineShare {
  const machine = flags.filter(Boolean).length;
  return machine === 0 ? 'none' : machine === flags.length ? 'all' : 'some';
}

/** The item at a path (or an id) and what its page draws; null when there is none. `language` picks a version. */
export async function itemView(catalog: Catalog, at: { path: string } | { id: EntityId }, options: { language?: string } = {}): Promise<ItemView | null> {
  let found: EntityView | null;
  let movedTo: string | undefined;
  if ('id' in at) found = await catalog.get(at.id);
  else {
    [found = null] = await catalog.getByPaths([at.path.replace(/\/+$/, '') || '/']);
    if (!found) {
      // An old path: the item it was moved to (one more statement, only then).
      const moved = await catalog.resolvePath(at.path);
      found = moved ? await catalog.get(moved.id) : null;
      if (found?.path) movedTo = found.path;
    }
  }
  if (!found) return null;
  const gate = new ExportGate(catalog);
  const shown = await gate.redact(found);
  const { body, ...facts } = shown.data as Record<string, unknown>;
  const isUnit = found.type === 'unit';
  const [bar, around, text] = await Promise.all([
    pathBar(catalog, found),
    isUnit ? catalog.unitNeighbours(found.id) : Promise.resolve({ previous: null, next: null }),
    isUnit ? unitText(catalog, gate, found.id, body as PageText | undefined, facts, shown.withheld, options.language) : Promise.resolve(null),
  ]);
  return {
    item: { ...found, data: facts as Json },
    ...(movedTo ? { movedTo } : {}),
    pathBar: bar ?? [],
    previous: brief(around.previous),
    next: brief(around.next),
    text,
  };
}

interface TextRow {
  id: EntityId;
  data: TextData;
  segments: Array<{ id: EntityId; data: { kind?: string; content?: string; proofread?: number; origin?: MachineOrigin } }>;
}

/** A unit's best words: its own, else the first text of it whose rights let it be shown (an edition before a hanacha), else a scan's pages. */
async function unitText(catalog: Catalog, gate: ExportGate, unit: EntityId, body: PageText | undefined, facts: Record<string, unknown>, withheld: string | undefined, language?: string): Promise<ShownText | null> {
  const ownVersions = (body?.versions ?? []).map((v) => ({ version: v.id, from: 'body' as const, language: v.language, ...(v.title ? { title: v.title } : {}) }));
  if (body && body.versions.length) {
    const version = body.versions.find((v) => v.language === language || v.id === language) ?? body.versions[0]!;
    const flags = version.segments.map((s) => unchecked(s.origin ?? version.origin));
    const source = facts.bodySource as { url?: string } | undefined;
    return {
      kind: 'words',
      from: 'body',
      version: version.id,
      language: version.language,
      profile: body.profile,
      ...(version.title ? { title: version.title } : {}),
      ...(version.credit ? { credit: version.credit } : {}),
      ...(version.licence ? { licence: version.licence } : {}),
      ...((version.url ?? source?.url) ? { url: version.url ?? source?.url } : {}),
      segments: version.segments,
      notes: version.notes ?? [],
      machine: share(flags),
      versions: ownVersions,
    };
  }
  // Texts of the unit, each with its segments in order: one statement.
  const { rows } = await catalog.db.query<TextRow>(
    `SELECT t.id, tr.data,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'data', sr.data) ORDER BY sr.data->>'order' COLLATE "C", s.id), '[]'::jsonb)
             FROM entity_ref y JOIN entity s ON s.id = y.from_id AND s.type = 'segment' AND NOT s.deleted JOIN revision sr ON sr.id = s.main_rev
             WHERE y.to_id = t.id AND y.field = 'text') AS segments
     FROM entity_ref x JOIN entity t ON t.id = x.from_id AND t.type = 'text' AND NOT t.deleted JOIN revision tr ON tr.id = t.main_rev
     WHERE x.to_id = $1 AND x.field = 'unit' AND tr.data->>'kind' IN ('edition', 'hanacha')
     ORDER BY (tr.data->>'kind' = 'edition') DESC, t.id`,
    [unit],
  );
  const shown: TextRow[] = [];
  for (const row of rows) if (!(await gate.textWithheld(row.id, row.data))) shown.push(row);
  const text = shown.find((t) => t.data.language === language) ?? shown[0];
  if (text) {
    const segments: PageSegment[] = text.segments.map((s) => ({
      id: s.id,
      kind: (s.data.kind ?? 'paragraph') as PageSegment['kind'],
      text: [{ text: s.data.content ?? '' }],
      ...(unchecked(s.data.origin, s.data.proofread) ? { origin: s.data.origin } : {}),
    }));
    return {
      kind: 'words',
      from: 'text',
      text: text.id,
      version: text.id,
      language: text.data.language ?? 'he',
      profile: 'plain',
      ...(text.data.credit ? { credit: text.data.credit } : {}),
      ...(text.data.licence ? { licence: text.data.licence } : {}),
      segments,
      notes: [],
      machine: share(text.segments.map((s) => unchecked(s.data.origin, s.data.proofread))),
      versions: shown.map((t) => ({ version: t.id, from: 'text' as const, language: t.data.language ?? 'he' })),
    };
  }
  const pages = await scanPages(catalog, unit);
  if (pages) return pages;
  if (withheld) return { kind: 'withheld', reason: withheld, ...((facts.bodySource as { url?: string } | undefined)?.url ? { url: (facts.bodySource as { url: string }).url } : {}) };
  return null;
}

/** The PDF pages of a scan the unit is printed on, from its contents maps, where the scan's file may be served: one statement. */
async function scanPages(catalog: Catalog, unit: EntityId): Promise<ShownText | null> {
  const { rows } = await catalog.db.query<{ scan: EntityId; publication: EntityId; pages: { from: number; to: number; scheme: 'printed' | 'pdf' }; labels: Parameters<typeof pdfPagesOf>[1] | null; file: string | null; rights: RightsState | null }>(
    `SELECT s.id AS scan, mr.data->>'publication' AS publication, mr.data->'pages' AS pages, sr.data->'pageLabels' AS labels, sr.data->>'file' AS file, f.rights_state AS rights
     FROM entity_ref x JOIN entity m ON m.id = x.from_id AND m.type = 'contents-map' AND NOT m.deleted JOIN revision mr ON mr.id = m.main_rev
     JOIN entity_ref y ON y.to_id = mr.data->>'publication' AND y.field = 'publication'
     JOIN entity s ON s.id = y.from_id AND s.type = 'scan' AND NOT s.deleted JOIN revision sr ON sr.id = s.main_rev
     LEFT JOIN file f ON f.sha256 = sr.data->>'file'
     WHERE x.to_id = $1 AND x.field = 'unit'
     ORDER BY m.id, s.id`,
    [unit],
  );
  for (const row of rows) {
    if (!row.file || !row.rights || !mayServe(row.rights)) continue;
    const range = pdfPagesOf(row.pages, row.labels ?? undefined);
    if (range) return { kind: 'pages', scan: row.scan, file: row.file, firstPage: range.from, lastPage: range.to, publication: row.publication };
  }
  return null;
}
