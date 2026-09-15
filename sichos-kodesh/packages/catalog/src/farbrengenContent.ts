import { classifyPdfEdition } from './pdfEdition.js';
import type { CatalogPdf } from './types.js';

/**
 * The "primary" content of a farbrengen: its own Toras Menachem or Sichos
 * Kodesh hanacha (the as-heard biltiMugah transcript, cited under either
 * edition) - not the later Rebbe-edited mugah text, not the maamar, and
 * not a biltiMugah PDF citing some other, unrelated source (letters,
 * memorial booklets, etc.). Surfacing this distinctly keeps the sichos
 * from being buried as one equal-weight category alongside Maamar/mugah/
 * hagahos, when the sichos are what "the farbrengen" itself means.
 */
export function isHighlightedFarbrengenHanacha(pdf: CatalogPdf): boolean {
  if (pdf.section !== 'biltiMugah') return false;
  const editions = classifyPdfEdition(pdf.label);
  return editions.includes('torasMenachem') || editions.includes('sichosKodesh');
}
