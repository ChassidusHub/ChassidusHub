import type { CatalogAudio, CatalogByYear, CatalogEntry, CatalogLibrary, CatalogRef, LibraryCollectionId, LibraryGroup, LibraryItemBase, OccasionGroup } from '@sichos-kodesh/catalog';
import { mafteiachMonthName, mafteiachMonthNameHebrew } from '@sichos-kodesh/catalog';
import type { Language } from '../i18n/translations';
import { hebrewFullDateLabel, hebrewYearLabel } from '../utils/formatHebrewDate';

/**
 * The phone's library browsers (docs/offline-plan.md WP4b) over catalog
 * schema 2's `library`: pure lookups the screens share, kept out of the
 * components so they are testable and cheap to memoise.
 */

/** The order collections appear in on the library page. */
export const LIBRARY_ORDER: readonly LibraryCollectionId[] = ['likkuteiSichos', 'maamorim', 'reshimos', 'yomanim', 'michtavimKlolim', 'hadranim', 'jemEvents'];

/** Each collection's browse axes, in the order its tabs show them. `supplement` is folded into `volume` (see volumeGroups). */
export const COLLECTION_AXES: Record<LibraryCollectionId, readonly string[]> = {
  likkuteiSichos: ['volume', 'parsha', 'moad'],
  maamorim: ['year', 'melukat'],
  reshimos: ['year'],
  yomanim: ['year'],
  michtavimKlolim: ['moed', 'year'],
  hadranim: ['masechta', 'year'],
  jemEvents: ['year', 'type'],
};

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
  return group.name;
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

/** The muted line under an item in a list: where and when, in a few words. */
export function itemSubtitle(collection: LibraryCollectionId, item: LibraryItemBase, language: Language): string {
  const record = item as LibraryItemBase & Record<string, unknown>;
  const parts: Array<string | null> = [];
  switch (collection) {
    case 'likkuteiSichos':
      parts.push(typeof record.sectionLabel === 'string' ? record.sectionLabel : null);
      break;
    case 'maamorim':
      parts.push(typeof record.occasionLabel === 'string' ? record.occasionLabel : null, dateLine(item, language));
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
      parts.push(typeof record.type === 'string' ? record.type : null, dateLine(item, language), minutes > 0 ? formatDuration(minutes) : null);
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
