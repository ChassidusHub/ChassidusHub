import type { CatalogPdf } from './types.js';

/**
 * mafteiach-index's mugah/biltiMugah/maamorim labels are citations to one
 * of two parallel printed series: the "Sefer" family (סה"ש - Sefer
 * HaSichos, סה"מ - Sefer HaMaamarim) or Toras Menachem (תו"מ). A user can
 * prefer one series so the app surfaces it first when an occasion has
 * both, without hiding the other (real citation variety is part of what
 * this dataset is for).
 */
export type PdfEdition = 'sefer' | 'torasMenachem';

/**
 * Classifies a PDF label by the printed edition(s) it cites, when
 * detectable - many real labels cite both together (e.g. "סה"ש/ תו"מ
 * התוועדויות", "תו"מ התוועדויות/ תו"מ סה"מ"), so this returns every
 * match, not just one. Returns [] for edition-agnostic labels (hagahos
 * scans, "שיחו"ק", etc.) - verified against the real crawled dataset.
 */
export function classifyPdfEdition(label: string): PdfEdition[] {
  const editions: PdfEdition[] = [];
  if (/סה"[שמ]/.test(label)) editions.push('sefer');
  if (/תו"מ/.test(label)) editions.push('torasMenachem');
  return editions;
}

/**
 * Stable-sorts a PDF-section's links so ones matching the preferred
 * edition come first. `null` (no preference set) leaves the original
 * order untouched.
 */
export function sortPdfsByEditionPreference(pdfs: CatalogPdf[], preference: PdfEdition | null): CatalogPdf[] {
  if (!preference) return pdfs;
  return [...pdfs].sort((a, b) => {
    const aMatches = classifyPdfEdition(a.label).includes(preference) ? 0 : 1;
    const bMatches = classifyPdfEdition(b.label).includes(preference) ? 0 : 1;
    return aMatches - bMatches;
  });
}
