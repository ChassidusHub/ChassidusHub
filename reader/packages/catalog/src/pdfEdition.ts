import type { CatalogPdf } from './types.js';

/**
 * mafteiach-index's mugah/biltiMugah/maamorim/hosofos labels are citations
 * to one of three distinct printed/transcribed series, not variants of
 * each other: "Sichos Kodesh" (שיחו"ק - the original, less-edited yearly
 * transcripts this app is named for), the "Sefer" family (סה"ש - Sefer
 * HaSichos, סה"מ - Sefer HaMaamarim - a separately edited canonical
 * series), and Toras Menachem (תו"מ). A user can prefer one series so the
 * app surfaces it first when an occasion has more than one, without
 * hiding the rest.
 */
export type PdfEdition = 'sichosKodesh' | 'sefer' | 'torasMenachem';

/**
 * Classifies a PDF label by the printed edition(s) it cites, when
 * detectable - many labels cite more than one together (e.g. "סה"ש/ תו"מ
 * התוועדויות", "תו"מ התוועדויות/ תו"מ סה"מ", "שיחו"ק/ בהוס' לסה"מ באתי
 * לגני ח"א"), so this returns every match, not just one. Returns [] for
 * edition-agnostic labels (hagahos scans, etc.).
 */
export function classifyPdfEdition(label: string): PdfEdition[] {
  const editions: PdfEdition[] = [];
  if (/שיחו"?ק|שיחות קודש/.test(label)) editions.push('sichosKodesh');
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
