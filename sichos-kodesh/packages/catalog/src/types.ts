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
}

export interface CatalogPdf {
  section: PdfSection;
  label: string;
  /** The Drive file id services/media-proxy's /drive/:fileId route expects. */
  driveFileId: string;
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
