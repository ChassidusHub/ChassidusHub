import { allSegments, mayServe, type EntityId, type MachineOrigin, type PageSegment, type PageText, type RightsState, type TextData, type TextProfile } from '@chassidushub/model';
import type { Catalog, EntityView } from './catalog.js';
import { pdfPagesOf } from './compare.js';
import { ExportGate } from './gate.js';
import { linkedPage } from './linked.js';
import type { Json } from './merge.js';
import { pathBar, type PathLevel } from './pathBar.js';

/**
 * One read for one page of the new site (apps/www): an item and
 * everything its page draws, ready to draw. That is its path bar, the
 * units before and after it, and the best words there are for it: its
 * own words, else a text of it the catalog keeps, else the pages of a
 * scan it is printed on. Each part is marked machine or checked. A
 * sefer's page also has its volumes and its additions, and a volume of a
 * sefer (/likkutei-sichos/12, which is no item of its own) is answered at
 * its path too, as the sefer with that volume's units. The site makes one
 * request for a page, never a second round after it, and the database
 * answers it in six statements at most.
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
  | ({ kind: 'pages' } & ScanPlace)
  | { kind: 'withheld'; reason: string; url?: string };

/** Where a unit is printed: the scan and its file (served at /v1/files/{sha256}) with the PDF pages that hold it. */
export interface ScanPlace {
  scan: EntityId;
  file: string;
  firstPage: number;
  lastPage: number;
  publication: EntityId;
  /** The PDF itself, when it is served from here: `/objects/{sha256}`, made whole by the API. */
  url: string | null;
}

/** A recording of the farbrengen a unit was said at, to hear the Rebbe say it. */
export interface HeardAt {
  id: EntityId;
  path: string | null;
  name: Json | null;
  durationMs: number | null;
}

export interface ItemView {
  /** The item's facts, without its words (they are in `text`). */
  item: EntityView;
  /** Set when the path asked was an old one: the item's path now. */
  movedTo?: string;
  pathBar: PathLevel[];
  previous: Brief | null;
  next: Brief | null;
  text: ShownText | null;
  /** A unit's scan, even when it has words of its own: the corner menu's "the scan". Null for other items, or when none may be served. */
  scan: ScanPlace | null;
  /** The recordings of the farbrengens a unit was said at, in their order. */
  recordings: HeardAt[];
  /** A sefer's volumes (its top-level parts) with how many units each holds: on a sefer's page and a volume's. */
  outline?: OutlinePart[];
  /** The books that are additions to a sefer (a commentary, an index), on its page. */
  additions?: Array<Brief & { kind: string | null }>;
  /** Set when the path was a volume of a sefer: `item` is the sefer, this the volume and its units in order. */
  volume?: { value: string; units: EntityView[] };
}

/** One volume in a sefer's outline. */
export interface OutlinePart {
  value: string;
  label: Json | null;
  units: number;
}

interface Brief {
  id: EntityId;
  path: string | null;
  name: Json | null;
}

const brief = (v: EntityView | null): Brief | null => (v ? { id: v.id, path: v.path, name: (v.data as { label?: Json }).label ?? null } : null);

/** Segments with their version's `origin` written onto each one with words that has none of its own, so a reader sees which a machine made. */
function withOrigin(segments: PageSegment[], origin: MachineOrigin | undefined): PageSegment[] {
  if (!origin) return segments;
  return segments.map((s) => ({
    ...s,
    ...(!s.origin && s.text?.length ? { origin } : {}),
    ...(s.children ? { children: withOrigin(s.children, origin) } : {}),
  }));
}

/** Whether words a machine made still wait for a person. */
const unchecked = (origin: MachineOrigin | undefined, proofread?: number) => Boolean(origin && !origin.checked && !(proofread && proofread > 0));

function share(flags: boolean[]): MachineShare {
  const machine = flags.filter(Boolean).length;
  return machine === 0 ? 'none' : machine === flags.length ? 'all' : 'some';
}

/** The item at a path (or an id) and what its page draws; null when there is none. `language` picks a version. */
export async function itemView(catalog: Catalog, at: { path: string } | { id: EntityId }, options: { language?: string } = {}): Promise<ItemView | null> {
  let found: EntityView | null = null;
  let movedTo: string | undefined;
  /** For a path that may be a volume of a sefer: the sefer's path and the volume's place. */
  let asVolume: { parent: string; value: string } | null = null;
  if ('id' in at) found = await catalog.get(at.id);
  else {
    const path = at.path.replace(/\/+$/, '') || '/';
    const words = path.split('/').filter(Boolean);
    if (words.length >= 2) asVolume = { parent: path.slice(0, path.lastIndexOf('/')), value: words.at(-1)! };
    // The path and the sefer above it in one statement: a volume's page (no item of its own) costs no more than a sefer's.
    const both = await catalog.getByPaths(asVolume ? [path, asVolume.parent] : [path]);
    const byPath = (p: string) => both.find((e) => e.path?.toLowerCase() === p.toLowerCase()) ?? null;
    found = byPath(path);
    const parent = asVolume ? byPath(asVolume.parent) : null;
    if (!found && parent?.type === 'work') return volumeView(catalog, parent, asVolume!.value);
    if (!found) {
      // An old path: the item it was moved to (one more statement, only then).
      const moved = await catalog.resolvePath(path);
      found = moved ? await catalog.get(moved.id) : null;
      if (found?.path) movedTo = found.path;
    }
    if (!found && asVolume) {
      // A volume of a sefer that moved: the volume at the sefer's path now.
      const moved = await catalog.resolvePath(asVolume.parent);
      const work = moved ? await catalog.get(moved.id) : null;
      if (work?.type === 'work' && work.path) {
        const view = await volumeView(catalog, work, asVolume.value);
        return view && { ...view, movedTo: `${work.path}/${asVolume.value}` };
      }
    }
  }
  if (!found) return null;
  const gate = new ExportGate(catalog);
  const shown = await gate.redact(found);
  const { body, ...facts } = shown.data as Record<string, unknown>;
  const isUnit = found.type === 'unit';
  const isWork = found.type === 'work';
  const events = Array.isArray(facts.events) ? (facts.events as EntityId[]) : [];
  const media = isUnit ? unitMedia(catalog, found.id, events) : Promise.resolve({ scan: null, recordings: [] });
  const [bar, around, text, { scan, recordings }, outline, additions] = await Promise.all([
    pathBar(catalog, found),
    isUnit ? catalog.unitNeighbours(found.id) : Promise.resolve({ previous: null, next: null }),
    isUnit ? unitText(catalog, gate, found.id, body as PageText | undefined, facts, shown.withheld, options.language, media) : Promise.resolve(null),
    media,
    isWork ? catalog.workOutline(found.id) : Promise.resolve(null),
    isWork ? additionsOf(catalog, found.id) : Promise.resolve(null),
  ]);
  return {
    item: { ...found, data: facts as Json },
    ...(movedTo ? { movedTo } : {}),
    pathBar: bar ?? [],
    previous: brief(around.previous),
    next: brief(around.next),
    text,
    scan,
    recordings,
    ...(outline ? { outline } : {}),
    ...(additions ? { additions } : {}),
  };
}

/** A sefer's additions, as the rows of its page list them: two statements (the page of them and their count). */
async function additionsOf(catalog: Catalog, work: EntityId): Promise<NonNullable<ItemView['additions']>> {
  const { items } = await linkedPage(catalog.db, work, { field: 'addition.to', type: 'work', limit: 100 });
  return items.map((addition) => {
    const data = addition.data as { title?: Json; addition?: { kind?: string } };
    return { id: addition.id, path: addition.path, name: data.title ?? null, kind: data.addition?.kind ?? null };
  });
}

/**
 * A volume of a sefer, for the sefer already found: the sefer and its path
 * bar, its outline, and the volume's units in order. Null when the sefer has
 * no volume there.
 */
async function volumeView(catalog: Catalog, work: EntityView, value: string): Promise<ItemView | null> {
  const [shown, bar, outline, units] = await Promise.all([new ExportGate(catalog).redact(work), pathBar(catalog, work), catalog.workOutline(work.id), catalog.workPart(work.id, value)]);
  if (!outline.some((part) => part.value === value)) return null;
  const { body: _words, ...facts } = shown.data as Record<string, unknown>;
  return { item: { ...work, data: facts as Json }, pathBar: bar ?? [], previous: null, next: null, text: null, scan: null, recordings: [], outline, volume: { value, units } };
}

interface TextRow {
  id: EntityId;
  data: TextData;
  segments: Array<{ id: EntityId; data: { kind?: string; content?: string; proofread?: number; origin?: MachineOrigin } }>;
}

/** A unit's best words: its own, else the first text of it whose rights let it be shown (an edition before a hanacha), else a scan's pages. */
async function unitText(catalog: Catalog, gate: ExportGate, unit: EntityId, body: PageText | undefined, facts: Record<string, unknown>, withheld: string | undefined, language: string | undefined, media: Promise<UnitMedia>): Promise<ShownText | null> {
  const ownVersions = (body?.versions ?? []).map((v) => ({ version: v.id, from: 'body' as const, language: v.language, ...(v.title ? { title: v.title } : {}) }));
  if (body && body.versions.length) {
    const version = body.versions.find((v) => v.language === language || v.id === language) ?? body.versions[0]!;
    // Every segment with words counts, inside sections and in the notes too, each by its own origin or its version's.
    const worded = [...allSegments(version.segments), ...allSegments(version.notes)].filter((s) => s.text?.length);
    const flags = worded.map((s) => unchecked(s.origin ?? version.origin));
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
      segments: withOrigin(version.segments, version.origin),
      notes: withOrigin(version.notes ?? [], version.origin),
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
  const { scan } = await media;
  if (scan) return { kind: 'pages', ...scan };
  if (withheld) return { kind: 'withheld', reason: withheld, ...((facts.bodySource as { url?: string } | undefined)?.url ? { url: (facts.bodySource as { url: string }).url } : {}) };
  return null;
}

interface UnitMedia {
  scan: ScanPlace | null;
  recordings: HeardAt[];
}

/**
 * A unit's scan and recordings in one statement: the PDF pages of a scan
 * it is printed on, from its contents maps, where the scan's file may be
 * served; and the recordings of its farbrengens.
 */
async function unitMedia(catalog: Catalog, unit: EntityId, events: EntityId[]): Promise<UnitMedia> {
  type ScanRow = { scan: EntityId; publication: EntityId; pages: { from: number; to: number; scheme: 'printed' | 'pdf' }; labels: Parameters<typeof pdfPagesOf>[1] | null; file: string | null; rights: RightsState | null; tier: string | null };
  const { rows } = await catalog.db.query<{ scans: ScanRow[]; recordings: HeardAt[] }>(
    `SELECT
       (SELECT coalesce(jsonb_agg(jsonb_build_object('scan', s.id, 'publication', mr.data->>'publication', 'pages', mr.data->'pages', 'labels', sr.data->'pageLabels', 'file', sr.data->>'file', 'rights', f.rights_state, 'tier', f.storage_tier) ORDER BY m.id, s.id), '[]'::jsonb)
        FROM entity_ref x JOIN entity m ON m.id = x.from_id AND m.type = 'contents-map' AND NOT m.deleted JOIN revision mr ON mr.id = m.main_rev
        JOIN entity_ref y ON y.to_id = mr.data->>'publication' AND y.field = 'publication'
        JOIN entity s ON s.id = y.from_id AND s.type = 'scan' AND NOT s.deleted JOIN revision sr ON sr.id = s.main_rev
        LEFT JOIN file f ON f.sha256 = sr.data->>'file'
        WHERE x.to_id = $1 AND x.field = 'unit') AS scans,
       (SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'path', g.path, 'name', gr.data->'title', 'durationMs', (gr.data->>'durationMs')::bigint)
                                  ORDER BY array_position($2::text[], gr.data->>'event'), gr.data->>'part' COLLATE "C", g.id), '[]'::jsonb)
        FROM revision gr JOIN entity g ON g.main_rev = gr.id AND g.type = 'recording' AND NOT g.deleted
        WHERE gr.data->>'event' = ANY($2::text[])) AS recordings`,
    [unit, events],
  );
  const { scans, recordings } = rows[0]!;
  let scan: ScanPlace | null = null;
  for (const row of scans) {
    if (!row.file || !row.rights || !mayServe(row.rights)) continue;
    const range = pdfPagesOf(row.pages, row.labels ?? undefined);
    if (range) {
      scan = { scan: row.scan, file: row.file, firstPage: range.from, lastPage: range.to, publication: row.publication, url: row.tier === 'public' ? `/objects/${row.file}` : null };
      break;
    }
  }
  return { scan, recordings: recordings.map((r) => ({ ...r, durationMs: r.durationMs ?? null })) };
}
