import type { CatalogAudio, CatalogByYear, CatalogEntry, CatalogLibrary, CatalogRef, LibraryCollectionId, LibraryGroup, LibraryItemBase, OccasionGroup } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import { hebrewFullDateLabel, hebrewYearLabel } from '../catalog/formatHebrewDate.js';
import type { Language } from '../search/language.js';

/**
 * The library browsers (docs/offline-plan.md WP4b; the web's since WP16)
 * over catalog schema 2's `library`: pure lookups both apps' screens
 * share, kept out of the components so they are testable and cheap to
 * memoise.
 */

/** The order collections appear in on the library page. */
export const LIBRARY_ORDER: readonly LibraryCollectionId[] = ['likkuteiSichos', 'maamorim', 'reshimos', 'yomanim', 'michtavimKlolim', 'hadranim', 'jemEvents'];

/**
 * Each collection's browse axes, in the order its tabs show them.
 * `supplement` is folded into `volume` (see axisGroups). The month, moed and
 * parsha views of the maamorim, reshimos and JEM recordings are the
 * catalog's (packages/catalog/src/library/views.ts).
 */
export const COLLECTION_AXES: Record<LibraryCollectionId, readonly string[]> = {
  likkuteiSichos: ['volume', 'parsha', 'moad'],
  maamorim: ['year', 'month', 'melukat', 'parsha', 'moad'],
  reshimos: ['year', 'month', 'parsha', 'moad'],
  yomanim: ['year'],
  michtavimKlolim: ['moed', 'year'],
  hadranim: ['masechta', 'year'],
  jemEvents: ['year', 'month', 'type', 'parsha', 'moad'],
};

/**
 * Axes one tab holds more than one of, the first its default: ספר המאמרים
 * מלוקט's six volumes, and its edition by the months of the year in four
 * parts (a toggle on the Melukat tab).
 */
export const AXIS_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  melukat: ['melukat', 'melukatByMonths'],
};

/** The tab an axis is shown under: a variant's own tab, or the axis itself. */
export function axisTab(axis: string): string {
  return Object.entries(AXIS_VARIANTS).find(([, variants]) => variants.includes(axis))?.[0] ?? axis;
}

/** An axis a collection can be browsed by: one of its tabs, or a variant of one. */
export function isCollectionAxis(collection: LibraryCollectionId, axis: string | undefined): axis is string {
  return !!axis && COLLECTION_AXES[collection].includes(axisTab(axis));
}

export type OccasionAxis = 'moadim' | 'parshiyos';

/** The groups of one axis. Likkutei Sichos' volumes end with the disputed "חלק מ" supplement, set apart. */
export function axisGroups(library: CatalogLibrary, collection: LibraryCollectionId, axis: string): LibraryGroup[] {
  const groups = library.collections[collection].groups;
  if (collection === 'likkuteiSichos' && axis === 'volume') return [...(groups.volume ?? []), ...(groups.supplement ?? [])];
  return groups[axis] ?? [];
}

export function findGroup(library: CatalogLibrary, collection: LibraryCollectionId, axis: string, slug: string): LibraryGroup | undefined {
  return axisGroups(library, collection, axis).find((group) => group.slug === slug);
}

const itemMaps = new WeakMap<object, Map<string, LibraryItemBase>>();

/** An item by id; the id map is built once per collection object. */
export function findItem(library: CatalogLibrary, collection: LibraryCollectionId, id: string): LibraryItemBase | undefined {
  const source = library.collections[collection];
  let map = itemMaps.get(source);
  if (!map) {
    map = new Map((source.items as LibraryItemBase[]).map((item) => [item.id, item]));
    itemMaps.set(source, map);
  }
  return map.get(id);
}

export function groupItems(library: CatalogLibrary, collection: LibraryCollectionId, group: LibraryGroup): LibraryItemBase[] {
  return group.itemIds.map((id) => findItem(library, collection, id)).filter((item): item is LibraryItemBase => !!item);
}

/** A group's name as shown: years and volumes follow the interface language, mafteiach's own names stay as they are. */
export function groupDisplayName(collection: LibraryCollectionId, axis: string, group: LibraryGroup, language: Language): string {
  const number = Number(group.slug);
  if (axis === 'year' && Number.isInteger(number) && number > 5000) return hebrewYearLabel(number, language);
  if (axis === 'volume' && collection === 'likkuteiSichos' && Number.isInteger(number) && group.slug !== '40') return language === 'he' ? `חלק ${group.name}` : `Volume ${number}`;
  if (axis === 'melukat') return language === 'he' ? `מלוקט ח״${group.name}` : `Melukat, volume ${number}`;
  return language === 'en' ? (group.nameEn ?? group.name) : group.name;
}

function dateLine(item: LibraryItemBase, language: Language): string | null {
  if (!item.hebrewDate || item.hebrewYear === undefined) return item.hebrewYear !== undefined ? hebrewYearLabel(item.hebrewYear, language) : null;
  return hebrewFullDateLabel(item.hebrewDate, item.hebrewYear, language);
}

function monthLine(hebrewYear: number | undefined, monthToken: string | undefined, language: Language): string | null {
  if (hebrewYear === undefined || !monthToken) return hebrewYear !== undefined ? hebrewYearLabel(hebrewYear, language) : null;
  const probe = `${hebrewYear}-${monthToken}-01`;
  return `${language === 'he' ? mafteiachMonthNameHebrew(probe) : mafteiachMonthName(probe)} ${hebrewYearLabel(hebrewYear, language)}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}′`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A mafteiach name (Hebrew) in the interface language: its English form when the catalog has one. */
function inLanguage(hebrew: unknown, english: unknown, language: Language): string | null {
  if (language === 'en' && typeof english === 'string' && english) return english;
  return typeof hebrew === 'string' && hebrew ? hebrew : null;
}

/**
 * An item's name, as its row and its own screen show it: a maamar by its
 * dibur hamaschil; a sicha by its volume and page, without the parsha
 * mafteiach adds in brackets (ח"א ע' 1 (בראשית)) - its subtitle, or the
 * group it is listed under, already names it; anything else in the
 * interface language when the catalog has the name in both (JEM's
 * recordings in Hebrew, the reshimos' and letters' names in English).
 */
export function itemTitle(collection: LibraryCollectionId, item: LibraryItemBase, language: Language): string {
  const record = item as LibraryItemBase & Record<string, unknown>;
  if (collection === 'maamorim' && typeof record.diburHamaschil === 'string' && record.diburHamaschil) return record.diburHamaschil;
  if (collection === 'likkuteiSichos') {
    const section = typeof record.sectionLabel === 'string' ? ` (${record.sectionLabel})` : null;
    return section && item.label.endsWith(section) ? item.label.slice(0, -section.length).trim() : item.label;
  }
  return (language === 'he' ? item.labelHe : item.labelEn) ?? item.label;
}

/** The muted line under an item in a list: where and when, in a few words. */
export function itemSubtitle(collection: LibraryCollectionId, item: LibraryItemBase, language: Language): string {
  const record = item as LibraryItemBase & Record<string, unknown>;
  const parts: Array<string | null> = [];
  switch (collection) {
    case 'likkuteiSichos':
      parts.push(inLanguage(record.sectionLabel, record.sectionLabelEn, language));
      break;
    case 'maamorim':
      parts.push(inLanguage(record.occasionLabel, record.occasionLabelEn, language), dateLine(item, language));
      break;
    case 'yomanim':
      parts.push(monthLine(item.hebrewYear, typeof record.monthToken === 'string' ? record.monthToken : undefined, language));
      break;
    case 'hadranim':
      parts.push(Array.isArray(record.dateLines) ? (record.dateLines as string[]).join(' · ') : null);
      break;
    case 'michtavimKlolim':
      parts.push(Array.isArray(record.languages) ? (record.languages as string[]).map((code) => LANGUAGE_NAMES[code]?.[language] ?? code).join(', ') : null);
      break;
    case 'jemEvents': {
      const minutes = item.refs.reduce((sum, ref) => sum + (ref.durationMs ?? 0), 0);
      const type = language === 'he' && typeof record.typeHe === 'string' ? record.typeHe : typeof record.type === 'string' ? record.type : null;
      parts.push(type, dateLine(item, language), minutes > 0 ? formatDuration(minutes) : null);
      break;
    }
    default:
      parts.push(dateLine(item, language));
  }
  return parts.filter((part): part is string => !!part).join(' · ');
}

const LANGUAGE_NAMES: Record<string, Record<Language, string>> = {
  yi: { en: 'Yiddish', he: 'אידיש' },
  he: { en: 'Hebrew', he: 'לה״ק' },
  en: { en: 'English', he: 'אנגלית' },
};

/** The item's recordings, as the player takes them. */
export function itemAudio(item: LibraryItemBase): CatalogAudio[] {
  return item.refs
    .filter((ref) => ref.kind === 'audio')
    .map((ref) => {
      const audio: CatalogAudio = { workerFilename: ref.sourceId, durationMs: ref.durationMs ?? 0 };
      if (ref.label) audio.chapterName = ref.label;
      if (ref.labelHe) audio.chapterNameHe = ref.labelHe;
      return audio;
    });
}

export function itemPdfs(item: LibraryItemBase): CatalogRef[] {
  return item.refs.filter((ref) => ref.kind === 'pdf');
}

/**
 * The player keys listening progress by (year, occasion) and chapter index.
 * A library item gets a stable negative id of its own, which no catalog
 * occasion ever has: even an item said at a farbrengen has its own list of
 * recordings, so sharing the farbrengen's key would mix up chapter indexes.
 */
export function playlistOccasionId(collection: LibraryCollectionId, item: LibraryItemBase): number {
  let hash = 0;
  for (const ch of `${collection}:${item.id}`) hash = (hash * 31 + ch.charCodeAt(0)) % 2_000_000_011;
  return -hash - 1;
}

/** A moed's or parsha's name in the interface language: its English name (catalog 1.2.0+), else mafteiach's Hebrew. */
export function occasionGroupName(group: OccasionGroup, language: Language): string {
  return language === 'en' ? (group.nameEn ?? group.name) : group.name;
}

/** The catalog occasions a moed or parsha lists, oldest first. Occasions the catalog does not hold are left out. */
export function occasionGroupEntries(catalog: CatalogByYear, group: OccasionGroup): CatalogEntry[] {
  const wanted = new Set(group.occasionIds);
  const entries: CatalogEntry[] = [];
  for (const yearEntries of Object.values(catalog)) {
    for (const entry of yearEntries) if (wanted.has(entry.occasionId)) entries.push(entry);
  }
  return entries.sort((a, b) => a.hebrewYear - b.hebrewYear || a.hebrewDate.localeCompare(b.hebrewDate) || a.occasionId - b.occasionId);
}

/** The catalog occasion an item was said at, when the catalog has it. */
export function linkedOccasion(catalog: CatalogByYear, item: LibraryItemBase): CatalogEntry | undefined {
  const occasionId = (item as { occasionId?: unknown }).occasionId;
  if (typeof occasionId !== 'number') return undefined;
  if (item.hebrewYear !== undefined) {
    const direct = catalog[item.hebrewYear]?.find((entry) => entry.occasionId === occasionId);
    if (direct) return direct;
  }
  for (const yearEntries of Object.values(catalog)) {
    const found = yearEntries.find((entry) => entry.occasionId === occasionId);
    if (found) return found;
  }
  return undefined;
}

/** The words `itemFacts` puts around the facts, in the interface language. */
export interface ItemFactWords {
  saidAt: string;
  printedIn: string;
  hemshech: (hemshech: string) => string;
  kuntres: (kuntres: string) => string;
  hasTranslation: string;
  hasTranscript: string;
}

/** The facts worth a line of their own on an item's page, per collection: citations, hemshech, date lines. Bibliographic facts only. */
export function itemFacts(collection: LibraryCollectionId, item: LibraryItemBase, words: ItemFactWords, language: Language = 'he'): string[] {
  const record = item as LibraryItemBase & Record<string, unknown>;
  const facts: string[] = [];
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  switch (collection) {
    case 'maamorim': {
      const occasion = text(inLanguage(record.occasionLabel, record.occasionLabelEn, language));
      if (occasion) facts.push(`${words.saidAt}: ${occasion}`);
      const hemshech = text(record.hemshech);
      if (hemshech) facts.push(words.hemshech(hemshech));
      const kuntres = text(record.kuntres);
      if (kuntres) facts.push(words.kuntres(kuntres));
      const citations = Array.isArray(record.citations) ? (record.citations as string[]).filter(Boolean) : [];
      if (citations.length) facts.push(`${words.printedIn}: ${citations.join(' · ')}`);
      break;
    }
    case 'hadranim':
      if (Array.isArray(record.dateLines)) facts.push(...(record.dateLines as string[]));
      break;
    case 'michtavimKlolim': {
      const citations = Array.isArray(record.citations) ? (record.citations as Array<{ prefix: string; label: string }>).filter((c) => c.label) : [];
      for (const citation of citations) facts.push(`${citation.prefix}: ${citation.label}`);
      break;
    }
    case 'likkuteiSichos':
      if (record.hasTranslated === true) facts.push(words.hasTranslation);
      break;
    case 'jemEvents':
      if (record.hasTranscript === true) facts.push(words.hasTranscript);
      break;
    default:
      break;
  }
  return facts;
}

/** A document's name on an item's page: its role (mugah, translation...) with mafteiach's own label. */
export function itemPdfLabel(ref: CatalogRef, roleNames: Record<string, string>, fallback: string): string {
  const role = ref.role ?? '';
  const roleName = roleNames[role] ?? (role.includes(':') ? role.split(':').slice(1).join(':') : role);
  // mafteiach's own label that only says what kind of file it is (שיחה, מתורגם): the role's name says it, in the interface language.
  if (ref.label && roleName && KIND_LABELS.has(ref.label.trim())) return roleName;
  if (ref.label && roleName && !ref.label.includes(roleName)) return `${roleName} · ${ref.label}`;
  return ref.label || roleName || fallback;
}

/** mafteiach's labels that name a file's kind rather than the file (the Likkutei Sichos buttons). */
const KIND_LABELS: ReadonlySet<string> = new Set(['שיחה', 'מתורגם', 'תרגום', 'קיצור', 'יומן']);

/** What an item's recordings play as: a playlist under an id no catalog occasion has (see playlistOccasionId), or null for an item without any. */
export function itemPlaylistEntry(collection: LibraryCollectionId, item: LibraryItemBase): CatalogEntry | null {
  const audio = itemAudio(item);
  if (audio.length === 0) return null;
  return {
    occasionId: playlistOccasionId(collection, item),
    hebrewYear: item.hebrewYear ?? 0,
    hebrewDate: item.hebrewDate ?? '',
    // The catalog's occasions carry a Hebrew name and an English one; so does the playlist.
    occasionLabel: item.labelHe ?? item.label,
    ...(item.labelHe ? { occasionLabelEn: item.label } : item.labelEn ? { occasionLabelEn: item.labelEn } : {}),
    audio,
    pdfs: [],
  };
}
