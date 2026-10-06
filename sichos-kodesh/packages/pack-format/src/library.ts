import type { LibraryCollection, LibraryGroup, LibraryItemBase } from '@sichos-kodesh/catalog';
import type { AudioProfile, ObjectRef, PackEntry, PackScope } from './manifest.js';
import type { ObjectsIndex } from './objectsIndex.js';
import { buildSourceLookup, sourceKey } from './objectsIndex.js';

/**
 * Packs of the library (catalog schema 2): a whole collection, or one
 * group of one of its browse axes - the same volumes, years, moadim and
 * masechtos the app browses by (the catalog's `groups`). The pack API
 * sizes and builds them, the download site offers them; a scope names
 * them in a URL:
 *
 *   reshimos                        the whole collection
 *   likkuteiSichos:volume:12        Likkutei Sichos, volume 12
 *   maamorim:year:5711              the maamorim of 5711
 *   michtavimKlolim:moed:tishrei    the michtavim of one moed
 *
 * An entry is an item, its refs every PDF it has and, for a collection
 * with recordings (maamorim), those in the profile asked for.
 */

/** The collections a pack can hold. JEM's events are recordings only and wait for their archive. */
export const PACKABLE_LIBRARY_COLLECTIONS = ['likkuteiSichos', 'maamorim', 'yomanim', 'michtavimKlolim', 'hadranim', 'reshimos'] as const;
export type PackableLibraryCollection = (typeof PACKABLE_LIBRARY_COLLECTIONS)[number];

export function isPackableLibraryCollection(value: string): value is PackableLibraryCollection {
  return (PACKABLE_LIBRARY_COLLECTIONS as readonly string[]).includes(value);
}

export const LIBRARY_COLLECTION_NAMES: Record<PackableLibraryCollection, { he: string; en: string }> = {
  likkuteiSichos: { he: 'לקוטי שיחות', en: 'Likkutei Sichos' },
  maamorim: { he: 'מאמרים', en: 'Maamorim' },
  yomanim: { he: 'יומנים', en: 'Yomanim' },
  michtavimKlolim: { he: 'מכתבים כלליים', en: 'Michtavim Klolim' },
  hadranim: { he: 'הדרנים', en: 'Hadranim' },
  reshimos: { he: 'רשימות', en: 'Reshimos' },
};

/** Each browse axis as a site names it ("by volume"), and how a group of it reads after the collection's name. */
export const LIBRARY_AXES: Record<string, { he: string; en: string; prefixHe: string; prefixEn: string }> = {
  volume: { he: 'לפי חלק', en: 'By volume', prefixHe: 'חלק ', prefixEn: 'vol. ' },
  supplement: { he: 'מילואים', en: 'Supplement', prefixHe: '', prefixEn: '' },
  parsha: { he: 'לפי פרשה', en: 'By parsha', prefixHe: 'פרשת ', prefixEn: '' },
  moad: { he: 'לפי מועד', en: 'By moed', prefixHe: '', prefixEn: '' },
  moed: { he: 'לפי מועד', en: 'By moed', prefixHe: '', prefixEn: '' },
  year: { he: 'לפי שנה', en: 'By year', prefixHe: '', prefixEn: '' },
  month: { he: 'לפי חודש', en: 'By month', prefixHe: '', prefixEn: '' },
  melukat: { he: 'ספר המאמרים מלוקט', en: 'Sefer HaMaamorim Melukat', prefixHe: 'מלוקט ', prefixEn: 'Melukat ' },
  melukatByMonths: { he: 'מלוקט, המהדורה החדשה', en: 'Melukat, new edition', prefixHe: 'מלוקט ', prefixEn: 'Melukat ' },
  masechta: { he: 'לפי מסכת', en: 'By masechta', prefixHe: 'מסכת ', prefixEn: '' },
  type: { he: 'לפי סוג', en: 'By type', prefixHe: '', prefixEn: '' },
};

export interface LibraryScopeSpec {
  collection: PackableLibraryCollection;
  axis?: string;
  group?: string;
}

/** The syntax alone: null when `spec` is not a library scope (a farbrengens year, say). */
export function parseLibraryScopeSpec(spec: string): LibraryScopeSpec | null {
  const [collection, axis, ...rest] = spec.trim().split(':');
  if (!collection || !isPackableLibraryCollection(collection)) return null;
  if (axis === undefined) return { collection };
  const group = rest.join(':');
  if (!axis || !group) throw new Error(`a library scope is <collection> or <collection>:<axis>:<group>, not "${spec}"`);
  return { collection, axis, group };
}

export interface LibraryScope {
  spec: LibraryScopeSpec;
  scope: PackScope;
  /** The file-name stem: `likkuteiSichos-volume-12`. */
  slug: string;
  /** The items it covers, in the catalog's order. */
  items: LibraryItemBase[];
}

function slugPart(value: string): string {
  return value
    .replace(/%20/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A scope against the published collection: its items and its manifest scope. Throws for an axis or group the collection lacks. */
export function resolveLibraryScope(spec: LibraryScopeSpec, collection: LibraryCollection<LibraryItemBase>): LibraryScope {
  const name = LIBRARY_COLLECTION_NAMES[spec.collection];
  if (!spec.axis || !spec.group) {
    return { spec, slug: spec.collection, items: collection.items, scope: { kind: 'custom', collection: spec.collection, label: { ...name } } };
  }
  const groups: LibraryGroup[] | undefined = collection.groups[spec.axis];
  if (!groups) throw new Error(`${spec.collection} has no "${spec.axis}" axis (it has ${Object.keys(collection.groups).join(', ')})`);
  const group = groups.find((g) => g.slug === spec.group);
  if (!group) throw new Error(`${spec.collection} has no ${spec.axis} "${spec.group}"`);
  const byId = new Map(collection.items.map((item) => [item.id, item]));
  const items = group.itemIds.map((id) => byId.get(id)).filter((item): item is LibraryItemBase => !!item);
  const axis = LIBRARY_AXES[spec.axis] ?? { prefixHe: '', prefixEn: '' };
  const label = { he: `${name.he}, ${axis.prefixHe}${group.name}`, en: `${name.en}, ${axis.prefixEn}${group.nameEn ?? group.slug}` };
  const scope: PackScope = { kind: 'custom', collection: spec.collection, label };
  const number = Number(spec.group);
  if (spec.axis === 'volume' && Number.isInteger(number)) Object.assign(scope, { kind: 'volume', volume: number });
  if (spec.axis === 'year' && Number.isInteger(number) && number > 5000) Object.assign(scope, { kind: 'year', hebrewYear: number });
  const stem = slugPart(spec.group) || String(groups.indexOf(group) + 1);
  return { spec, scope, slug: `${spec.collection}-${spec.axis}-${stem}`, items };
}

export interface LibrarySelection {
  /** sha256 -> bytes of every object the selection needs and the index knows. */
  objects: Record<string, number>;
  bytes: number;
  /** Files the index has no object for yet. */
  missing: number;
  entries: PackEntry[];
}

/** The same exact sizing as sizeSelection, for library items: every PDF, and recordings in `profile`. */
export function sizeLibrarySelection(collection: PackableLibraryCollection, items: LibraryItemBase[], index: ObjectsIndex, profile: AudioProfile): LibrarySelection {
  const lookup = buildSourceLookup(index);
  const result: LibrarySelection = { objects: {}, bytes: 0, missing: 0, entries: [] };
  for (const item of items) {
    const refs: ObjectRef[] = [];
    for (const ref of item.refs) {
      if (ref.kind !== 'audio' && ref.kind !== 'pdf') continue;
      const sha = lookup.get(sourceKey(ref.kind, ref.sourceId, ref.kind === 'audio' ? profile : undefined));
      const indexed = sha ? index.objects[sha] : undefined;
      if (!sha || !indexed) {
        result.missing += 1;
        continue;
      }
      if (result.objects[sha] === undefined) {
        result.objects[sha] = indexed.bytes;
        result.bytes += indexed.bytes;
      }
      const objectRef: ObjectRef = { sha256: sha, bytes: indexed.bytes, kind: ref.kind, sourceId: ref.sourceId };
      if (ref.kind === 'audio') objectRef.profile = profile;
      if (ref.role) objectRef.role = ref.role;
      if (ref.label) objectRef.label = ref.label;
      if (ref.durationMs !== undefined) objectRef.durationMs = ref.durationMs;
      refs.push(objectRef);
    }
    if (refs.length === 0) continue;
    const entry: PackEntry = { collection, itemId: item.id, label: item.label, refs };
    if (item.hebrewYear !== undefined) entry.hebrewYear = item.hebrewYear;
    if (item.hebrewDate !== undefined) entry.hebrewDate = item.hebrewDate;
    result.entries.push(entry);
  }
  return result;
}

/** Whether a collection lists recordings at all (so the site asks for a quality only then). */
export function libraryHasAudio(collection: LibraryCollection<LibraryItemBase>): boolean {
  return collection.items.some((item) => item.refs.some((ref) => ref.kind === 'audio'));
}
