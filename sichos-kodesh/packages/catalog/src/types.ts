/**
 * The app-facing dataset this package builds, joined from
 * packages/mafteiach-index's crawled data. Deliberately a small subset of
 * the full `CatalogEntry` sketched in docs/PLANNING.md (no quality
 * variants, captions, or rights-status field yet) — this is the thin-MVP
 * slice: enough to know what's downloadable for a given occasion, nothing
 * more. Only bibliographic metadata (dates, labels, file identifiers) is
 * ever bundled here, never the actual copyrighted text/audio bytes — those
 * stay server-fetched on demand through services/media-proxy.
 */

export type PdfSection = 'mugah' | 'biltiMugah' | 'maamorim' | 'hagahos' | 'hosofos';

export interface CatalogAudio {
  /** The filename services/media-proxy's /jem-audio/:filename route expects - extracted from the resolved JEM CloudFront URL. */
  workerFilename: string;
  durationMs: number;
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
   * Present for links shared before Google's 2021 resource-key change
   * (verified: 253 of ~14k Drive PDF links in the real dataset) - required
   * as the `resourcekey` query param on /drive/:fileId or the file 404s/
   * redirects to a Google sign-in page, even though it's genuinely public.
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
