import type { DatabaseSync } from 'node:sqlite';
import { extractDriveFileId } from './driveLinks.js';
import type { CatalogAudio, CatalogEntry, CatalogPdf, PdfSection } from './types.js';

const PDF_SECTIONS: readonly PdfSection[] = ['mugah', 'biltiMugah', 'maamorim', 'hagahos', 'hosofos'];

interface OccasionRow {
  id: number;
  hebrew_year: number;
  hebrew_date: string;
  occasion_label: string;
}

interface JemAudioRow {
  occasion_id: number;
  duration_ms: number;
  url: string;
}

interface LinkRow {
  occasion_id: number;
  section: string;
  label: string;
  url: string;
}

function workerFilenameFromUrl(url: string): string | null {
  try {
    return new URL(url).pathname.split('/').pop() || null;
  } catch {
    return null;
  }
}

/**
 * Joins packages/mafteiach-index's crawled dataset (`occasions`, `links`,
 * `jem_audio` tables - schema in that package's src/db.ts) into one
 * `CatalogEntry` per occasion, grouped by Hebrew year. Only the already
 * fully-resolved JEM audio (jem_audio, populated by that package's
 * bin/resolveJemAudio.ts) and Drive-hosted PDF links are included - a
 * catalog entry with neither is a genuine gap, kept in the output (not
 * filtered out) so the app can show "nothing available" rather than
 * silently omitting the occasion.
 */
export function buildCatalog(db: DatabaseSync): Record<number, CatalogEntry[]> {
  const occasions = db.prepare('SELECT id, hebrew_year, hebrew_date, occasion_label FROM occasions').all() as unknown as OccasionRow[];
  const audioRows = db.prepare('SELECT occasion_id, duration_ms, url FROM jem_audio').all() as unknown as JemAudioRow[];
  const placeholders = PDF_SECTIONS.map(() => '?').join(',');
  const linkRows = db
    .prepare(`SELECT occasion_id, section, label, url FROM links WHERE section IN (${placeholders})`)
    .all(...PDF_SECTIONS) as unknown as LinkRow[];

  const audioByOccasion = new Map<number, CatalogAudio[]>();
  for (const row of audioRows) {
    const workerFilename = workerFilenameFromUrl(row.url);
    if (!workerFilename) continue;
    const list = audioByOccasion.get(row.occasion_id) ?? [];
    list.push({ workerFilename, durationMs: row.duration_ms });
    audioByOccasion.set(row.occasion_id, list);
  }

  const pdfsByOccasion = new Map<number, CatalogPdf[]>();
  for (const row of linkRows) {
    const driveFileId = extractDriveFileId(row.url);
    if (!driveFileId) continue; // not every link in these sections is a Drive share link (sie.org, chabad.org, etc.)
    const list = pdfsByOccasion.get(row.occasion_id) ?? [];
    list.push({ section: row.section as PdfSection, label: row.label, driveFileId });
    pdfsByOccasion.set(row.occasion_id, list);
  }

  const byYear: Record<number, CatalogEntry[]> = {};
  for (const occasion of occasions) {
    const entry: CatalogEntry = {
      occasionId: occasion.id,
      hebrewYear: occasion.hebrew_year,
      hebrewDate: occasion.hebrew_date,
      occasionLabel: occasion.occasion_label,
      audio: audioByOccasion.get(occasion.id) ?? [],
      pdfs: pdfsByOccasion.get(occasion.id) ?? [],
    };
    const list = byYear[occasion.hebrew_year] ?? [];
    list.push(entry);
    byYear[occasion.hebrew_year] = list;
  }

  for (const list of Object.values(byYear)) {
    list.sort((a, b) => a.hebrewDate.localeCompare(b.hebrewDate) || a.occasionId - b.occasionId);
  }

  return byYear;
}
