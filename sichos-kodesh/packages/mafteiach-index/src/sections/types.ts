/** A side-nav entry (a volume, parsha, moed, masechta or year tab). `slug` is exactly how the site addresses it. */
export interface NavEntry {
  slug: string;
  name: string;
  ord: number;
}

/** "Page `slug` of this kind lists these items, in this order" - e.g. the LS parsha page for bereshit, or a moed on /all/moadim. */
export interface MembershipPage {
  slug: string;
  itemIds: string[];
}

export interface SectionLink {
  label: string;
  url: string;
}

export type LikkutSichaLinkRole = 'sicha' | 'translated' | 'kitzur' | 'other';

export interface LikkutSichaRecord {
  /** `{volume}:{page}`, from the site's own element id. */
  id: string;
  volume: number;
  page: number;
  /** As printed on the button: ח"א ע' 1 (בראשית). */
  label: string;
  /** The parsha/moed section of the volume page it sits in (`div.parsha#parsha_{seq}`). */
  sectionSeq: number;
  sectionLabel: string;
  /** Position within the volume. */
  ord: number;
  /** The numeric id in `/likkutei_sichos/{id}/kitzur`, when a kitzur exists. */
  kitzurId: number | null;
  links: Array<SectionLink & { role: LikkutSichaLinkRole }>;
}

export interface MaamarListingEntry {
  id: number;
  /** The by_year page it is listed on; null when only a Melukat volume lists it. */
  hebrewYear: number | null;
  /** mafteiach month token of its group (`group_5` -> "05", `group_6A` -> "06A"). */
  monthToken: string | null;
  occasionLabel: string;
  diburHamaschil: string;
  /** "א" from "[המשך: א]". */
  hemshech: string | null;
  /** The text after "קונטרס:". */
  kuntres: string | null;
}

export type MaamarLinkSection = 'mugah' | 'biltiMugah' | 'hanachos' | 'hagahos' | 'audio' | 'video';

export interface MaamarDetail {
  /** Every link, with the heading it sits under - the מוגה links' labels are the printed citations (סה"מ מלוקט ח"א/ ...). */
  links: Array<SectionLink & { section: MaamarLinkSection; group: string | null }>;
  hasVideo: boolean;
  hasTochenInyanim: boolean;
  /** The farbrengen it was said at, from the "ראה ההתוועדות" /all/{date} link. */
  hebrewDate: string | null;
}

export interface MaamarRecord extends MaamarListingEntry {
  detail: MaamarDetail;
}

export interface YomanRecord {
  url: string;
  hebrewYear: number;
  monthToken: string;
  ord: number;
  label: string;
}

export interface HadranRecord {
  id: number;
  masechtaSlug: string | null;
  ord: number;
  /** As listed (the masechta, or "הדרן על הש"ס"). */
  label: string;
  /** The printed date lines, one per farbrengen it was said at. */
  dateLines: string[];
  links: Array<SectionLink & { section: 'biltiMugah' | 'mugah' }>;
  /** mafteiach date keys of those farbrengens. */
  hebrewDates: string[];
  hasToichen: boolean;
}

export type MichtavLanguage = 'yi' | 'he' | 'en' | 'other';

export interface MichtavRecord {
  id: number;
  moedSlug: string | null;
  hebrewYear: number | null;
  ord: number;
  heading: string;
  links: Array<SectionLink & { language: MichtavLanguage; edition: string }>;
  citations: Array<{ prefix: string; label: string; url: string | null }>;
  hasTochenInyanim: boolean;
}
