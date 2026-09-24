/**
 * The library: every collection beyond the dated farbrengens, for the phone
 * app's browsers (catalog schema 2 - see version.ts). The farbrengens stay
 * exactly where they are, in `byYear`; the library sits next to them and
 * points into them by occasion id (moadim, parshiyos, a maamar's
 * farbrengen, a JEM event's occasion).
 *
 * Every item has the same `refs` (the files it has) so downloads, packs,
 * search and "downloaded" state stay generic across collections; each
 * collection adds its own fields and its browse axes (`groups`). Only
 * bibliographic facts, flags and links - never mafteiach's editorial
 * writing (see packages/mafteiach-index's README).
 */

/** The collection ids of the library - the same strings as packages/pack-format's CollectionId. */
export type LibraryCollectionId = 'likkuteiSichos' | 'maamorim' | 'yomanim' | 'hadranim' | 'michtavimKlolim' | 'reshimos' | 'jemEvents';

export const LIBRARY_COLLECTION_IDS: readonly LibraryCollectionId[] = ['likkuteiSichos', 'maamorim', 'yomanim', 'hadranim', 'michtavimKlolim', 'reshimos', 'jemEvents'];

/**
 * One file an item has. `sourceId` is the id the apps already download by:
 * a JEM `workerFilename` for audio, a Drive `driveFileId` for a PDF.
 */
export interface CatalogRef {
  kind: 'audio' | 'pdf' | 'text';
  sourceId: string;
  /** What the file is to the item: a PDF edition (mugah, biltiMugah, sicha, translated, he:mugah), an audio chapter's index. */
  role?: string;
  label?: string;
  durationMs?: number;
  /** Legacy Drive shares need their resource key (see the catalog's CatalogPdf). */
  resourceKey?: string;
}

export interface LibraryItemBase {
  /** Unique within its collection. */
  id: string;
  label: string;
  hebrewYear?: number;
  /** A mafteiach date key (`5711-05-10`), when the item has one date. */
  hebrewDate?: string;
  refs: CatalogRef[];
}

/**
 * One entry of a browse axis: a volume, parsha, moed, year, masechta.
 * `itemIds` are the items it lists, in the site's order.
 */
export interface LibraryGroup {
  slug: string;
  name: string;
  itemIds: string[];
}

export interface LikkuteiSichosItem extends LibraryItemBase {
  /** `{volume}:{page}`. `label` is as printed: ח"א ע' 1 (בראשית). */
  volume: number;
  page: number;
  /** The parsha or moed heading it sits under in its volume. */
  sectionLabel: string;
  hasTranslated: boolean;
  hasKitzur: boolean;
  /** The id of mafteiach's kitzur page, when one exists (a link, not its text). */
  kitzurId?: number;
  /**
   * Set on the sichos of "חלק מ": the two books of supplements (מילואים)
   * Vaad L'hafotzas Sichos printed in 5781. It is not one of the 39 volumes
   * of the set, and Kehot disputes the Vaad's right to print it, so it is
   * grouped under `supplement`, never under `volume`.
   */
  supplement?: true;
}

export interface MaamarItem extends LibraryItemBase {
  diburHamaschil: string;
  /** Where it was said: יו"ד שבט, בשלח, י"ג שבט. */
  occasionLabel: string;
  hemshech?: string;
  kuntres?: string;
  /** mafteiach month token of the year page it is listed under. */
  monthToken?: string;
  /** The farbrengen (catalog occasion) it was said at. */
  occasionId?: number;
  /** The ספר המאמרים מלוקט volumes it is printed in. */
  melukatVolumes: number[];
  /** The printed citations (the מוגה links' labels): סה"מ מלוקט ח"א/ סה"מ באתי לגני ח"א. */
  citations: string[];
}

export interface YomanItem extends LibraryItemBase {
  /** The Drive file id. `label` is the diarist or title as listed. */
  monthToken: string;
}

export interface HadranItem extends LibraryItemBase {
  masechta?: string;
  /** The printed date lines, one per farbrengen it was said at. */
  dateLines: string[];
  /** mafteiach date keys of those farbrengens. */
  hebrewDates: string[];
}

export interface MichtavItem extends LibraryItemBase {
  moed?: string;
  /** yi, he, en - the languages it exists in. */
  languages: string[];
  citations: Array<{ prefix: string; label: string }>;
}

export interface ReshimaItem extends LibraryItemBase {
  occasionId: number;
}

export interface JemEventItem extends LibraryItemBase {
  /** JEM's event type: Farbrengen, Sicha, Children's Rally, General Audience, ... */
  type: string;
  /** JEM's own name for the event (English). */
  name: string;
  hasTranscript: boolean;
  /** The catalog occasion whose recordings these are, when mafteiach lists it (the farbrengens collection already has it). */
  occasionId?: number;
}

export interface LibraryCollection<T extends LibraryItemBase> {
  items: T[];
  /** Browse axes by name: `volume`, `parsha`, `moad`, `year`, `melukat`, `masechta`, `moed`, `type`. */
  groups: Record<string, LibraryGroup[]>;
}

export interface LibraryCollections {
  likkuteiSichos: LibraryCollection<LikkuteiSichosItem>;
  maamorim: LibraryCollection<MaamarItem>;
  yomanim: LibraryCollection<YomanItem>;
  hadranim: LibraryCollection<HadranItem>;
  michtavimKlolim: LibraryCollection<MichtavItem>;
  reshimos: LibraryCollection<ReshimaItem>;
  jemEvents: LibraryCollection<JemEventItem>;
}

/** A moed or parsha as mafteiach groups the farbrengens: its Hebrew name and the occasions it lists. */
export interface OccasionGroup {
  slug: string;
  name: string;
  /** Its English name (catalog 1.2.0+, `groupNameEn`); omitted when there is none. */
  nameEn?: string;
  occasionIds: number[];
}

export interface CatalogLibrary {
  /** mafteiach's 101 moadim and yemei d'pagra, in its order. */
  moadim: OccasionGroup[];
  /** The 53 parshiyos, in order. */
  parshiyos: OccasionGroup[];
  collections: LibraryCollections;
}
