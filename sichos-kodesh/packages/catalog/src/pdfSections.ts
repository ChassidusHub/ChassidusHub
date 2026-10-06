import type { PdfSection } from './types.js';

/** Display order for PDF sections wherever they're grouped or listed - mirrors mafteiach.app's own tab order. */
export const PDF_SECTION_ORDER: readonly PdfSection[] = ['mugah', 'biltiMugah', 'maamorim', 'hagahos', 'hosofos'];

/**
 * Short display label for each PDF section - `mugah`/`biltiMugah` carry a
 * qualifier since "edited vs. unedited version of the same sicha" is the
 * distinction most worth surfacing at a glance when both are grouped
 * together under one occasion.
 */
export const PDF_SECTION_LABELS: Record<PdfSection, string> = {
  mugah: 'Mugah (edited)',
  biltiMugah: 'Bilti Mugah (unedited)',
  maamorim: 'Maamorim',
  hagahos: 'Hagahos',
  hosofos: 'Hosofos',
};
