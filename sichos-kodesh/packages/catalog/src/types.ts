/**
 * The app-facing dataset this package builds, joined from
 * packages/mafteiach-index's crawled data: enough to know what's
 * downloadable for a given occasion, nothing more. Only bibliographic
 * metadata (dates, labels, file identifiers) is ever bundled here, never
 * the actual copyrighted text/audio bytes — those stay server-fetched on
 * demand through services/media-proxy.
 */

export type PdfSection = 'mugah' | 'biltiMugah' | 'maamorim' | 'hagahos' | 'hosofos';

/**
 * Who is speaking on a recording, when it is not the Rebbe himself: a
 * shiur (a class on the sicha) or a chazara (a chozer's review of the
 * farbrengen). Absent means the Rebbe's own voice - the JEM farbrengen
 * recordings that make up the whole catalog today. See playbackPolicy.ts
 * for the one thing the apps decide from it.
 */
export type AudioKind = 'shiur' | 'chazara';

export interface CatalogAudio {
  /** The filename services/media-proxy's /jem-audio/:filename route expects - extracted from the resolved JEM CloudFront URL. */
  workerFilename: string;
  durationMs: number;
  /** Omitted for the Rebbe's own recordings (see `AudioKind`). */
  kind?: AudioKind;
  /**
   * ccdb's own chapter label for this recording within its farbrengen
   * (e.g. "Sicha 1", "Sicha 2", "Ma'amar") - a farbrengen is usually
   * several separate recordings, not one, and `entry.audio`'s array
   * order is already the real chapter/playback order (see
   * packages/mafteiach-index's jemAudio.ts). Omitted on the rare
   * recording ccdb itself doesn't name.
   */
  chapterName?: string;
}

export interface CatalogPdf {
  section: PdfSection;
  label: string;
  /** The Drive file id services/media-proxy's /drive/:fileId route expects. */
  driveFileId: string;
  /**
   * Present for links shared before Google's 2021 resource-key change -
   * required as the `resourcekey` query param on /drive/:fileId or the
   * file 404s/redirects to a Google sign-in page, even though it's
   * genuinely public.
   */
  resourceKey?: string;
}

export interface CatalogEntry {
  occasionId: number;
  hebrewYear: number;
  /** Raw mafteiach-index date key, e.g. "5711-05-10" or "5711-06A-14" for a leap-year Adar I date - see packages/mafteiach-index/src/types.ts. */
  hebrewDate: string;
  occasionLabel: string;
  audio: CatalogAudio[];
  pdfs: CatalogPdf[];
}

/** One catalog JSON file's shape: every occasion for one Hebrew year. */
export type CatalogYear = CatalogEntry[];
