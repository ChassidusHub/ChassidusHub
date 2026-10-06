import type { CatalogLibrary, JemEventItem, LibraryCollection, LibraryGroup, LibraryItemBase, OccasionGroup } from './types.js';

/**
 * ספר המאמרים מלוקט in its edition by the months of the year: four parts,
 * the maamorim of each month grouped by occasion (editions/melukat-new.json).
 * `maamar` is the library's maamar id, or null for what it prints that the
 * index does not list (a רשימה, notes, a maamar mafteiach does not have).
 */
export interface MelukatByMonthsEdition {
  parts: Array<{ part: number; he: string; en: string }>;
  entries: Array<{ part: number; month: string; title: string; maamar: string | null }>;
}

export interface LibraryEditions {
  melukatByMonths?: MelukatByMonthsEdition;
}

/** A Tishrei-based month (01-12) and its names; Adar I and Adar II are one Adar here. */
const MONTHS: ReadonlyArray<{ slug: string; he: string; en: string }> = [
  { slug: '01', he: 'תשרי', en: 'Tishrei' },
  { slug: '02', he: 'חשוון', en: 'Cheshvan' },
  { slug: '03', he: 'כסלו', en: 'Kislev' },
  { slug: '04', he: 'טבת', en: 'Teves' },
  { slug: '05', he: 'שבט', en: 'Shevat' },
  { slug: '06', he: 'אדר', en: 'Adar' },
  { slug: '07', he: 'ניסן', en: 'Nisan' },
  { slug: '08', he: 'אייר', en: 'Iyar' },
  { slug: '09', he: 'סיוון', en: 'Sivan' },
  { slug: '10', he: 'תמוז', en: 'Tamuz' },
  { slug: '11', he: 'מנחם אב', en: 'Menachem Av' },
  { slug: '12', he: 'אלול', en: 'Elul' },
];

/** `5738-06B-14` -> month `06`, day 14. */
function monthDay(hebrewDate: string | undefined): { month: string; day: number } | null {
  const match = hebrewDate?.match(/^\d{4}-(\d{2})[AB]?-(\d{2})/);
  return match ? { month: match[1]!, day: Number(match[2]) } : null;
}

/**
 * All years' items of each month, one group per month in the year's order
 * (Tishrei first): within a month by day, then by year, so the maamorim of
 * one occasion stand together - Yud Shevat's, then Tu B'Shevat's.
 */
function monthGroups(items: LibraryItemBase[]): LibraryGroup[] {
  const byMonth = new Map<string, Array<{ id: string; day: number; year: number }>>();
  for (const item of items) {
    const md = monthDay(item.hebrewDate);
    if (!md) continue;
    const list = byMonth.get(md.month) ?? [];
    list.push({ id: item.id, day: md.day, year: item.hebrewYear ?? 0 });
    byMonth.set(md.month, list);
  }
  return MONTHS.filter((month) => byMonth.has(month.slug)).map((month) => ({
    slug: month.slug,
    name: month.he,
    nameEn: month.en,
    itemIds: byMonth
      .get(month.slug)!
      .sort((a, b) => a.day - b.day || a.year - b.year)
      .map((entry) => entry.id),
  }));
}

/**
 * The items of each moed or parsha, through the occasion each is linked to
 * (mafteiach's own lists of the occasions under a moed or parsha), in the
 * order of the moadim and parshiyos; within one, by date.
 */
function occasionAxisGroups(items: Array<LibraryItemBase & { occasionId?: number }>, axis: OccasionGroup[]): LibraryGroup[] {
  const byOccasion = new Map<number, LibraryItemBase[]>();
  for (const item of items) {
    if (item.occasionId === undefined) continue;
    byOccasion.set(item.occasionId, [...(byOccasion.get(item.occasionId) ?? []), item]);
  }
  const byDate = (a: LibraryItemBase, b: LibraryItemBase) => (a.hebrewDate ?? '').localeCompare(b.hebrewDate ?? '') || a.id.localeCompare(b.id, 'en', { numeric: true });
  const groups: LibraryGroup[] = [];
  for (const group of axis) {
    const listed = group.occasionIds.flatMap((id) => byOccasion.get(id) ?? []);
    if (listed.length === 0) continue;
    const unique = [...new Map(listed.map((item) => [item.id, item])).values()].sort(byDate);
    groups.push({ slug: group.slug, name: group.name, ...(group.nameEn ? { nameEn: group.nameEn } : {}), itemIds: unique.map((item) => item.id) });
  }
  return groups;
}

/** The four parts of the edition by months, each in the edition's order; a maamar it prints twice (as said and as edited) is listed once. */
function melukatByMonthsGroups(edition: MelukatByMonthsEdition, known: ReadonlySet<string>): LibraryGroup[] {
  const seen = new Set<string>();
  return edition.parts.map((part) => ({
    slug: String(part.part),
    name: part.he,
    nameEn: part.en,
    itemIds: edition.entries
      .filter((entry) => entry.part === part.part && entry.maamar !== null && known.has(entry.maamar))
      .map((entry) => entry.maamar!)
      .filter((id) => !seen.has(id) && !!seen.add(id)),
  }));
}

/**
 * JEM's recordings by their type, the biggest first, each named in Hebrew
 * too (the item's `typeHe`). JEM spells some types two ways ("Ma’amar" and
 * "Ma'amar"): an apostrophe is an apostrophe.
 */
function jemTypeGroups(items: JemEventItem[]): LibraryGroup[] {
  const byType = new Map<string, JemEventItem[]>();
  for (const item of items) {
    const type = item.type.replace(/[\u2018\u2019]/g, "'");
    const list = byType.get(type);
    if (list) list.push(item);
    else byType.set(type, [item]);
  }
  return [...byType]
    .sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b))
    .map(([type, list]) => {
      const nameHe = list.find((item) => item.typeHe)?.typeHe;
      return { slug: type, name: type, ...(nameHe ? { nameHe } : {}), itemIds: list.map((item) => item.id) };
    });
}

function withGroups<T extends LibraryItemBase>(collection: LibraryCollection<T>, groups: Record<string, LibraryGroup[]>): LibraryCollection<T> {
  const kept = Object.fromEntries(Object.entries(groups).filter(([, list]) => list.length > 0));
  return { ...collection, groups: { ...collection.groups, ...kept } };
}

/**
 * The browse views the index's own pages don't have, derived from what the
 * library already holds: every maamar, reshima and linked JEM recording by
 * month (all years), by moed and by parsha; JEM's recordings by type; and
 * the maamorim in ספר המאמרים
 * מלוקט's edition by months (`melukatByMonths`), beside the six volumes in
 * their printed order (`melukat`, from mafteiach). A copy is returned.
 */
export function addLibraryViews(library: CatalogLibrary, editions: LibraryEditions = {}): CatalogLibrary {
  const { maamorim, reshimos, jemEvents } = library.collections;
  const occasionViews = (items: Array<LibraryItemBase & { occasionId?: number }>) => ({
    month: monthGroups(items),
    moad: occasionAxisGroups(items, library.moadim),
    parsha: occasionAxisGroups(items, library.parshiyos),
  });
  const known = new Set(maamorim.items.map((item) => item.id));
  return {
    ...library,
    collections: {
      ...library.collections,
      maamorim: withGroups(maamorim, {
        ...occasionViews(maamorim.items),
        ...(editions.melukatByMonths ? { melukatByMonths: melukatByMonthsGroups(editions.melukatByMonths, known) } : {}),
      }),
      reshimos: withGroups(reshimos, occasionViews(reshimos.items)),
      jemEvents: withGroups(jemEvents, { ...occasionViews(jemEvents.items), type: jemTypeGroups(jemEvents.items) }),
    },
  };
}
