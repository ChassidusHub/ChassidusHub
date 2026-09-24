import type { DatabaseSync } from 'node:sqlite';
import { gematriya, HDate } from '@hebcal/core';
import { extractDriveFileId, extractDriveResourceKey } from '../driveLinks.js';
import { groupNameEn } from '../translate/groupNameEn.js';
import type {
  CatalogLibrary,
  CatalogRef,
  HadranItem,
  JemEventItem,
  LibraryCollection,
  LibraryGroup,
  LibraryItemBase,
  LikkuteiSichosItem,
  MaamarItem,
  MichtavItem,
  OccasionGroup,
  ReshimaItem,
  YomanItem,
} from './types.js';

/**
 * Builds the library (catalog schema 2) from packages/mafteiach-index's
 * section tables and, when given, packages/jem-index's jem.db. Both are
 * read with plain SQL, the same way buildCatalog reads the farbrengens.
 * A table the database does not have yet (the section crawler never ran)
 * yields an empty collection, not an error.
 */

function hasTable(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(name);
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((c) => c.name === column);
}

function basename(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.slice(path.lastIndexOf('/') + 1);
  } catch {
    return url.slice(url.lastIndexOf('/') + 1);
  }
}

function pdfRef(url: string, role: string, label: string | null): CatalogRef | null {
  const sourceId = extractDriveFileId(url);
  if (!sourceId) return null;
  const ref: CatalogRef = { kind: 'pdf', sourceId, role };
  if (label) ref.label = label;
  const resourceKey = extractDriveResourceKey(url);
  if (resourceKey) ref.resourceKey = resourceKey;
  return ref;
}

function audioRef(url: string, chapterIndex: number, label: string | null, durationMs: number | null): CatalogRef {
  const ref: CatalogRef = { kind: 'audio', sourceId: basename(url), role: String(chapterIndex) };
  if (label) ref.label = label;
  if (durationMs != null) ref.durationMs = durationMs;
  return ref;
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

function empty<T extends LibraryItemBase>(): LibraryCollection<T> {
  return { items: [], groups: {} };
}

/** A side-nav the crawler stored, with the items each entry lists (from `memberships`). */
function storedGroups(db: DatabaseSync, section: string, kind: string): LibraryGroup[] {
  if (!hasTable(db, 'nav_entries')) return [];
  const nav = db.prepare('SELECT slug, name FROM nav_entries WHERE section = ? AND kind = ? ORDER BY ord').all(section, kind) as Array<{ slug: string; name: string }>;
  const members = groupBy(
    db.prepare('SELECT slug, item_id FROM memberships WHERE section = ? AND kind = ? ORDER BY slug, ord').all(section, kind) as Array<{ slug: string; item_id: string }>,
    (row) => row.slug,
  );
  return nav.map((entry) => ({ slug: entry.slug, name: entry.name, itemIds: (members.get(entry.slug) ?? []).map((row) => row.item_id) }));
}

function hasMemberships(db: DatabaseSync, section: string, kind: string): boolean {
  return hasTable(db, 'memberships') && db.prepare('SELECT 1 FROM memberships WHERE section = ? AND kind = ? LIMIT 1').get(section, kind) !== undefined;
}

/** A side-nav the crawler stored, with the items that carry its slug in one of their own fields. */
function navGroups<T extends LibraryItemBase>(db: DatabaseSync, section: string, kind: string, items: T[], slugOf: (item: T) => string | number | undefined): LibraryGroup[] {
  if (!hasTable(db, 'nav_entries')) return [];
  const nav = db.prepare('SELECT slug, name FROM nav_entries WHERE section = ? AND kind = ? ORDER BY ord').all(section, kind) as Array<{ slug: string; name: string }>;
  const bySlug = groupBy(items, (item) => String(slugOf(item) ?? ''));
  return nav.map((entry) => ({ slug: entry.slug, name: entry.name, itemIds: (bySlug.get(entry.slug) ?? []).map((item) => item.id) }));
}

/** Groups by Hebrew year for collections whose site view has no year nav. */
function yearGroups<T extends LibraryItemBase>(items: T[]): LibraryGroup[] {
  const byYear = groupBy(
    items.filter((item) => item.hebrewYear !== undefined),
    (item) => item.hebrewYear!,
  );
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => ({ slug: String(year), name: gematriya(year), itemIds: byYear.get(year)!.map((item) => item.id) }));
}

function occasionGroups(db: DatabaseSync, section: 'moadim' | 'parshiyos'): OccasionGroup[] {
  return storedGroups(db, section, section === 'moadim' ? 'moad' : 'parsha').map((group) => {
    const nameEn = groupNameEn(group);
    return {
      slug: group.slug,
      name: group.name,
      ...(nameEn ? { nameEn } : {}),
      occasionIds: group.itemIds.map(Number).filter(Number.isInteger),
    };
  });
}

function buildLikkuteiSichos(db: DatabaseSync): LibraryCollection<LikkuteiSichosItem> {
  if (!hasTable(db, 'ls_sichos')) return empty();
  const links = groupBy(db.prepare('SELECT sicha_id, role, label, url FROM ls_links ORDER BY rowid').all() as Array<{ sicha_id: string; role: string; label: string; url: string }>, (row) => row.sicha_id);
  const rows = db.prepare('SELECT id, volume, page, label, section_label, kitzur_id, has_translated, has_kitzur FROM ls_sichos ORDER BY volume, ord').all() as Array<{
    id: string;
    volume: number;
    page: number;
    label: string;
    section_label: string;
    kitzur_id: number | null;
    has_translated: number;
    has_kitzur: number;
  }>;
  // The volumes mafteiach has a page for but leaves out of its volume menu
  // (the crawler stores them as supplements): "חלק מ", not one of the 39.
  const supplementSlugs = new Set(
    (hasTable(db, 'nav_entries') ? (db.prepare("SELECT slug FROM nav_entries WHERE section = 'likkuteiSichos' AND kind = 'supplement'").all() as Array<{ slug: string }>) : []).map(
      (row) => row.slug,
    ),
  );
  const items = rows.map((row) => {
    const item: LikkuteiSichosItem = {
      id: row.id,
      label: row.label,
      volume: row.volume,
      page: row.page,
      sectionLabel: row.section_label,
      hasTranslated: row.has_translated === 1,
      hasKitzur: row.has_kitzur === 1,
      refs: (links.get(row.id) ?? [])
        .filter((link) => link.role === 'sicha' || link.role === 'translated')
        .map((link) => pdfRef(link.url, link.role, link.label))
        .filter((ref): ref is CatalogRef => ref !== null),
    };
    if (row.kitzur_id !== null) item.kitzurId = row.kitzur_id;
    if (supplementSlugs.has(String(row.volume))) item.supplement = true;
    return item;
  });
  return {
    items,
    groups: {
      volume: navGroups(db, 'likkuteiSichos', 'volume', items, (item) => item.volume),
      supplement: navGroups(db, 'likkuteiSichos', 'supplement', items, (item) => item.volume).map((group) => ({ ...group, name: `מילואים - "חלק ${group.name}"` })),
      parsha: storedGroups(db, 'likkuteiSichos', 'parsha'),
      moad: storedGroups(db, 'likkuteiSichos', 'moad'),
    },
  };
}

function buildMaamorim(db: DatabaseSync): LibraryCollection<MaamarItem> {
  if (!hasTable(db, 'maamorim')) return empty();
  const links = groupBy(
    db.prepare('SELECT maamor_id, section, label, url FROM maamorim_links ORDER BY rowid').all() as Array<{ maamor_id: number; section: string; label: string; url: string }>,
    (row) => row.maamor_id,
  );
  const audio = hasTable(db, 'maamor_jem_audio')
    ? groupBy(
        db.prepare('SELECT maamor_id, chapter_index, chapter_name, duration_ms, url FROM maamor_jem_audio ORDER BY maamor_id, chapter_index').all() as Array<{
          maamor_id: number;
          chapter_index: number;
          chapter_name: string | null;
          duration_ms: number;
          url: string;
        }>,
        (row) => row.maamor_id,
      )
    : new Map();
  const melukat = new Map<string, number[]>();
  for (const group of storedGroups(db, 'maamorim', 'melukat')) {
    for (const id of group.itemIds) melukat.set(id, [...(melukat.get(id) ?? []), Number(group.slug)]);
  }
  const rows = db.prepare('SELECT id, hebrew_year, month_token, occasion_label, dibur_hamaschil, hemshech, kuntres, hebrew_date, occasion_id FROM maamorim ORDER BY id').all() as Array<{
    id: number;
    hebrew_year: number | null;
    month_token: string | null;
    occasion_label: string;
    dibur_hamaschil: string;
    hemshech: string | null;
    kuntres: string | null;
    hebrew_date: string | null;
    occasion_id: number | null;
  }>;
  const items = rows.map((row) => {
    const itemLinks = links.get(row.id) ?? [];
    const refs: CatalogRef[] = [
      ...itemLinks
        .filter((link) => link.section !== 'audio' && link.section !== 'video')
        .map((link) => pdfRef(link.url, link.section, link.label))
        .filter((ref): ref is CatalogRef => ref !== null),
      ...(audio.get(row.id) ?? []).map((a: { chapter_index: number; chapter_name: string | null; duration_ms: number; url: string }) => audioRef(a.url, a.chapter_index, a.chapter_name, a.duration_ms)),
    ];
    const item: MaamarItem = {
      id: String(row.id),
      label: row.dibur_hamaschil,
      diburHamaschil: row.dibur_hamaschil,
      occasionLabel: row.occasion_label,
      melukatVolumes: melukat.get(String(row.id)) ?? [],
      citations: itemLinks.filter((link) => link.section === 'mugah').map((link) => link.label),
      refs,
    };
    if (row.hebrew_year !== null) item.hebrewYear = row.hebrew_year;
    if (row.hebrew_date !== null) item.hebrewDate = row.hebrew_date;
    if (row.hemshech !== null) item.hemshech = row.hemshech;
    if (row.kuntres !== null) item.kuntres = row.kuntres;
    if (row.month_token !== null) item.monthToken = row.month_token;
    if (row.occasion_id !== null) item.occasionId = row.occasion_id;
    return item;
  });
  return {
    items,
    groups: {
      year: navGroups(db, 'maamorim', 'year', items, (item) => item.hebrewYear),
      melukat: storedGroups(db, 'maamorim', 'melukat'),
    },
  };
}

function buildYomanim(db: DatabaseSync): LibraryCollection<YomanItem> {
  if (!hasTable(db, 'yomanim')) return empty();
  const rows = db.prepare('SELECT url, hebrew_year, month_token, label FROM yomanim ORDER BY hebrew_year, month_token, ord').all() as Array<{
    url: string;
    hebrew_year: number;
    month_token: string;
    label: string;
  }>;
  const items: YomanItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ref = pdfRef(row.url, 'yoman', null);
    const id = ref?.sourceId ?? row.url;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, label: row.label, hebrewYear: row.hebrew_year, monthToken: row.month_token, refs: ref ? [ref] : [] });
  }
  return { items, groups: { year: navGroups(db, 'yomanim', 'year', items, (item) => item.hebrewYear) } };
}

function buildHadranim(db: DatabaseSync): LibraryCollection<HadranItem> {
  if (!hasTable(db, 'hadranim')) return empty();
  const links = groupBy(db.prepare('SELECT hadran_id, section, label, url FROM hadranim_links ORDER BY rowid').all() as Array<{ hadran_id: number; section: string; label: string; url: string }>, (row) => row.hadran_id);
  const dates = groupBy(db.prepare('SELECT hadran_id, hebrew_date FROM hadran_occasions ORDER BY hadran_id, ord').all() as Array<{ hadran_id: number; hebrew_date: string }>, (row) => row.hadran_id);
  const masechtaOrder = new Map(
    (hasTable(db, 'nav_entries') ? (db.prepare("SELECT slug, ord FROM nav_entries WHERE section = 'hadranim' AND kind = 'masechta'").all() as Array<{ slug: string; ord: number }>) : []).map((row) => [row.slug, row.ord]),
  );
  const rows = (db.prepare('SELECT id, masechta_slug, ord, label, date_lines FROM hadranim').all() as Array<{ id: number; masechta_slug: string | null; ord: number; label: string; date_lines: string }>).sort(
    (a, b) => (masechtaOrder.get(a.masechta_slug ?? '') ?? 1e9) - (masechtaOrder.get(b.masechta_slug ?? '') ?? 1e9) || a.ord - b.ord || a.id - b.id,
  );
  const items = rows.map((row) => {
    const hebrewDates = (dates.get(row.id) ?? []).map((d) => d.hebrew_date);
    const item: HadranItem = {
      id: String(row.id),
      label: row.label,
      dateLines: row.date_lines ? row.date_lines.split('; ') : [],
      hebrewDates,
      refs: (links.get(row.id) ?? []).map((link) => pdfRef(link.url, link.section, link.label)).filter((ref): ref is CatalogRef => ref !== null),
    };
    if (row.masechta_slug !== null) item.masechta = row.masechta_slug;
    if (hebrewDates[0]) item.hebrewYear = Number(hebrewDates[0].slice(0, 4));
    return item;
  });
  return {
    items,
    groups: {
      // A siyum can close several masechtos, so the crawler stores every
      // masechta page a hadran is on; older databases have only the first.
      masechta: hasMemberships(db, 'hadranim', 'masechta') ? storedGroups(db, 'hadranim', 'masechta') : navGroups(db, 'hadranim', 'masechta', items, (item) => item.masechta),
      year: storedGroups(db, 'hadranim', 'year'),
    },
  };
}

function buildMichtavim(db: DatabaseSync): LibraryCollection<MichtavItem> {
  if (!hasTable(db, 'michtavim')) return empty();
  const links = groupBy(
    db.prepare('SELECT michtav_id, language, edition, label, url FROM michtavim_links ORDER BY rowid').all() as Array<{ michtav_id: number; language: string; edition: string; label: string; url: string }>,
    (row) => row.michtav_id,
  );
  const citations = groupBy(db.prepare('SELECT michtav_id, prefix, label FROM michtavim_citations ORDER BY rowid').all() as Array<{ michtav_id: number; prefix: string; label: string }>, (row) => row.michtav_id);
  const moedOrder = new Map(
    (hasTable(db, 'nav_entries') ? (db.prepare("SELECT slug, ord FROM nav_entries WHERE section = 'michtavim' AND kind = 'moed'").all() as Array<{ slug: string; ord: number }>) : []).map((row) => [row.slug, row.ord]),
  );
  const rows = (db.prepare('SELECT id, moed_slug, hebrew_year, ord, heading FROM michtavim').all() as Array<{ id: number; moed_slug: string | null; hebrew_year: number | null; ord: number; heading: string }>).sort(
    (a, b) => (moedOrder.get(a.moed_slug ?? '') ?? 1e9) - (moedOrder.get(b.moed_slug ?? '') ?? 1e9) || (a.hebrew_year ?? 0) - (b.hebrew_year ?? 0) || a.ord - b.ord,
  );
  const items = rows.map((row) => {
    const itemLinks = links.get(row.id) ?? [];
    const item: MichtavItem = {
      id: String(row.id),
      label: row.heading,
      languages: [...new Set(itemLinks.map((link) => link.language))],
      citations: (citations.get(row.id) ?? []).map((c) => ({ prefix: c.prefix, label: c.label })),
      refs: itemLinks.map((link) => pdfRef(link.url, `${link.language}:${link.edition}`, link.label)).filter((ref): ref is CatalogRef => ref !== null),
    };
    if (row.moed_slug !== null) item.moed = row.moed_slug;
    if (row.hebrew_year !== null) item.hebrewYear = row.hebrew_year;
    return item;
  });
  return {
    items,
    groups: {
      moed: navGroups(db, 'michtavim', 'moed', items, (item) => item.moed),
      year: storedGroups(db, 'michtavim', 'year'),
    },
  };
}

/** The pre-Nesius entries' רשימות: mafteiach files them as the occasion's מוגה links. */
function buildReshimos(db: DatabaseSync): LibraryCollection<ReshimaItem> {
  if (!hasColumn(db, 'occasions', 'is_pre_nesius')) return empty();
  const rows = db
    .prepare(
      `SELECT o.id, o.hebrew_year, o.hebrew_date, o.occasion_label, l.label, l.url
       FROM occasions o JOIN links l ON l.occasion_id = o.id
       WHERE o.is_pre_nesius = 1 AND l.section = 'mugah' ORDER BY o.hebrew_date, o.id, l.rowid`,
    )
    .all() as Array<{ id: number; hebrew_year: number; hebrew_date: string; occasion_label: string; label: string; url: string }>;
  const items: ReshimaItem[] = [];
  for (const [id, group] of groupBy(rows, (row) => row.id)) {
    const first = group[0]!;
    items.push({
      id: String(id),
      label: first.occasion_label,
      hebrewYear: first.hebrew_year,
      hebrewDate: first.hebrew_date,
      occasionId: id,
      refs: group.map((row) => pdfRef(row.url, 'reshimos', row.label)).filter((ref): ref is CatalogRef => ref !== null),
    });
  }
  return { items, groups: { year: yearGroups(items) } };
}

/**
 * JEM's own month numbering always has 13 slots (Adar I = 6, Adar or
 * Adar II = 7, Nisan = 8); mafteiach's tokens are 01-12 with 06A/06B in a
 * leap year. Returns the mafteiach date key, or undefined without a day.
 */
export function jemHebrewDate(year: number | null, month: number | null, day: number | null): string | undefined {
  if (year === null || month === null || day === null || month < 1 || month > 13) return undefined;
  let token: string;
  if (month <= 5) token = String(month).padStart(2, '0');
  else if (month === 6) token = '06A';
  else if (month === 7) token = HDate.isLeapYear(year) ? '06B' : '06';
  else token = String(month - 1).padStart(2, '0');
  return `${year}-${token}-${String(day).padStart(2, '0')}`;
}

function buildJemEvents(jem: DatabaseSync | null, maf: DatabaseSync): LibraryCollection<JemEventItem> {
  if (!jem || !hasTable(jem, 'events')) return empty();
  const occasionByFile = new Map<string, number>();
  if (hasTable(maf, 'jem_audio')) {
    for (const row of maf.prepare('SELECT occasion_id, url FROM jem_audio ORDER BY occasion_id').all() as Array<{ occasion_id: number; url: string }>) {
      const file = basename(row.url);
      if (!occasionByFile.has(file)) occasionByFile.set(file, row.occasion_id);
    }
  }
  const recordings = groupBy(
    jem
      .prepare(
        `SELECT coalesce(e.parent_id, e.id) AS root, e.id AS event_id, r.ccdb_recording_id, r.name, r.duration_ms, r.url
         FROM audio_recordings r JOIN events e ON e.id = r.event_id
         ORDER BY root, CASE WHEN e.parent_id IS NULL THEN 0 ELSE 1 END, e.id, r.ccdb_recording_id`,
      )
      .all() as Array<{ root: number; event_id: number; ccdb_recording_id: number; name: string | null; duration_ms: number | null; url: string }>,
    (row) => row.root,
  );
  const events = jem
    .prepare('SELECT id, name, type, hebrew_year, hebrew_month, hebrew_day, has_transcript FROM events WHERE parent_id IS NULL ORDER BY hebrew_year, hebrew_month, hebrew_day, id')
    .all() as Array<{ id: number; name: string; type: string; hebrew_year: number | null; hebrew_month: number | null; hebrew_day: number | null; has_transcript: number }>;
  const items: JemEventItem[] = [];
  for (const event of events) {
    const tree = recordings.get(event.id) ?? [];
    if (tree.length === 0) continue;
    const seenFiles = new Set<string>();
    const refs: CatalogRef[] = [];
    for (const recording of tree) {
      const file = basename(recording.url);
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);
      refs.push(audioRef(recording.url, refs.length, recording.name, recording.duration_ms));
    }
    const item: JemEventItem = { id: String(event.id), label: event.name, name: event.name, type: event.type.trim(), hasTranscript: event.has_transcript === 1, refs };
    if (event.hebrew_year !== null) item.hebrewYear = event.hebrew_year;
    const hebrewDate = jemHebrewDate(event.hebrew_year, event.hebrew_month, event.hebrew_day);
    if (hebrewDate) item.hebrewDate = hebrewDate;
    const occasionId = refs.map((ref) => occasionByFile.get(ref.sourceId)).find((id) => id !== undefined);
    if (occasionId !== undefined) item.occasionId = occasionId;
    items.push(item);
  }
  const byType = groupBy(items, (item) => item.type);
  const types = [...byType.keys()].sort((a, b) => byType.get(b)!.length - byType.get(a)!.length || a.localeCompare(b));
  return {
    items,
    groups: {
      year: yearGroups(items),
      type: types.map((type) => ({ slug: type, name: type, itemIds: byType.get(type)!.map((item) => item.id) })),
    },
  };
}

export function buildLibrary(maf: DatabaseSync, jem: DatabaseSync | null = null): CatalogLibrary {
  return {
    moadim: occasionGroups(maf, 'moadim'),
    parshiyos: occasionGroups(maf, 'parshiyos'),
    collections: {
      likkuteiSichos: buildLikkuteiSichos(maf),
      maamorim: buildMaamorim(maf),
      yomanim: buildYomanim(maf),
      hadranim: buildHadranim(maf),
      michtavimKlolim: buildMichtavim(maf),
      reshimos: buildReshimos(maf),
      jemEvents: buildJemEvents(jem, maf),
    },
  };
}
