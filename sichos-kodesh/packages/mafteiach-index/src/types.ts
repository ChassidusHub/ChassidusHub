/** A citation/source link extracted from a farbrengen detail panel. */
export interface LinkRef {
  label: string;
  url: string;
  /** Nearest preceding sub-heading in the panel (e.g. "ליקוט", "הנחה", a maamor title), when the source groups links that way. */
  group?: string;
}

export interface LinkSection {
  hasContent: boolean;
  links: LinkRef[];
}

export interface AudioSection {
  hasContent: boolean;
  /** Typically a single ashreinu.app player link (JEM's audio app - see docs/PLANNING.md). */
  links: LinkRef[];
}

export interface VideoSection {
  hasContent: boolean;
  /** YouTube video ids embedded via mafteiach.app's addYouTubeEmbed(id, ...) calls. */
  youtubeIds: string[];
}

/**
 * A free-text note panel (mafteiach.app's own editorial writing, not
 * primary-source text) that may also contain inline links — unlike the
 * plain link-list sections, the prose itself is the point here, so `text`
 * keeps it (with `<br>` converted to newlines) and `links` is a
 * supplementary structured view of any `<a>` tags found within it.
 */
export interface NoteSection {
  hasContent: boolean;
  text: string | null;
  links: LinkRef[];
}

/**
 * The full per-farbrengen breakdown mafteiach.app tracks: whether the sicha
 * exists as a "mugah" (Rebbe-edited) text, a "bilti mugah" (unedited
 * hanacha) text, and/or a recording — exactly the muga/hanacha/recorded
 * distinction this dataset exists to capture.
 *
 * `hagahos` (annotations/corrections) is a plain link list like `mugah`;
 * `hosofos` ("more" / addenda) is free-text like `tochenInyanim` — verified
 * against real examples of both (see tests/fixtures), not assumed
 * symmetric just because they're presented as similar-looking tabs.
 */
export interface FarbrengenDetail {
  id: number;
  biltiMugah: LinkSection;
  mugah: LinkSection;
  maamorim: LinkSection;
  audio: AudioSection;
  video: VideoSection;
  english: LinkSection;
  tochenInyanim: NoteSection;
  hagahos: LinkSection;
  hosofos: NoteSection;
}

export interface FarbrengenListingEntry {
  id: number;
  hebrewYear: number;
  /**
   * Raw mafteiach.app date key: "{year}-{month}-{day}", optionally with a
   * trailing lowercase letter (e.g. "5738-01-09b") marking a second/third
   * indexed occasion on the same Hebrew date rather than a distinct date.
   *
   * Month is Tishrei-based (01=Tishrei ... 07=Nisan ... 12=Elul, matching
   * this repo's kvius-engine convention) — NOT HDate's native Nisan-based
   * numbering. Confirmed against real 5711 (a leap year) data: rather than
   * shifting every month after Adar by one the way HDate's native
   * numbering does, mafteiach.app keeps Nisan fixed at "07" year-round and
   * instead splits month "06" into "06A" (Adar Rishon) / "06B" (Adar
   * Sheini) — so `month` is `string`, not `number`, and callers converting
   * to this repo's HDate-based types must special-case the "06A"/"06B"
   * suffix rather than assume a two-digit numeric month.
   */
  hebrewDate: string;
  /** True for content predating the Rebbe's Nesius in 5711. */
  isPreNesius: boolean;
  /** The listing's occasion label, e.g. "לך לך, יו״ד מ״ח". */
  occasionLabel: string;
}

export interface FarbrengenRecord extends FarbrengenListingEntry {
  detail: FarbrengenDetail;
}
