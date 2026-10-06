/**
 * How the PDF reader shows its pages, in both apps: the colours of the
 * paper and how the pages move. The reader's settings sheet sets it (the
 * text reader's sheet, without the text's own options).
 *
 * Dark pages (white on black) are not part of this: they stay the
 * per-theme switch they always were (settings/invertPdfInDarkMode), on at
 * night and off by day unless chosen otherwise. `tint` is the paper the
 * rest of the time.
 */

/** The paper when the pages aren't dark: as scanned, a warm sepia, or grey (a yellowed scan made plain). */
export type PdfTint = 'original' | 'sepia' | 'gray';
export const PDF_TINTS: readonly PdfTint[] = ['original', 'sepia', 'gray'];

/** The colours the sheet offers: a tint, or dark pages. */
export type PdfColors = PdfTint | 'dark';
export const PDF_COLORS: readonly PdfColors[] = ['original', 'sepia', 'gray', 'dark'];

/** One long scroll, or a page at a time. */
export type PdfPaging = 'scroll' | 'pages';
export const PDF_PAGINGS: readonly PdfPaging[] = ['scroll', 'pages'];

export interface PdfLook {
  tint: PdfTint;
  /** A stronger contrast, for a faint scan. */
  contrast: boolean;
  paging: PdfPaging;
  /** The screen stays on while a PDF is open. */
  keepAwake: boolean;
}

export const DEFAULT_PDF_LOOK: PdfLook = { tint: 'original', contrast: false, paging: 'scroll', keepAwake: false };

/** Where both apps keep it (the same key, like the inversion flags). */
export const PDF_LOOK_STORAGE_KEY = 'sichos-kodesh:pdf-look';

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A stored look, anything missing or unknown at its default. */
export function parsePdfLook(raw: string | null | undefined): PdfLook {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch {
    value = {};
  }
  return {
    tint: oneOf(value.tint, PDF_TINTS, DEFAULT_PDF_LOOK.tint),
    contrast: typeof value.contrast === 'boolean' ? value.contrast : DEFAULT_PDF_LOOK.contrast,
    paging: oneOf(value.paging, PDF_PAGINGS, DEFAULT_PDF_LOOK.paging),
    keepAwake: typeof value.keepAwake === 'boolean' ? value.keepAwake : DEFAULT_PDF_LOOK.keepAwake,
  };
}

/** One step of the pages' filter, in the order applied: the web writes it as CSS, the phone as React Native's `filter` style. */
export type PdfFilter = { invert: number } | { hueRotate: string } | { sepia: number } | { grayscale: number } | { brightness: number } | { contrast: number };

/** The filter the pages are drawn through: dark pages flip the colours (keeping their hues), a tint warms or greys them, and more contrast deepens the ink. */
export function pdfFilters(colors: PdfColors, contrast: boolean): PdfFilter[] {
  const filters: PdfFilter[] = [];
  if (colors === 'dark') filters.push({ invert: 1 }, { hueRotate: '180deg' });
  if (colors === 'sepia') filters.push({ sepia: 0.45 }, { brightness: 0.97 });
  if (colors === 'gray') filters.push({ grayscale: 1 });
  if (contrast) filters.push({ contrast: 1.35 });
  return filters;
}

/** The same filter as a CSS `filter` value, or `none`. */
export function pdfCssFilter(colors: PdfColors, contrast: boolean): string {
  const css = pdfFilters(colors, contrast).map((step) => {
    const [name, value] = Object.entries(step)[0] as [string, number | string];
    const cssName = name === 'hueRotate' ? 'hue-rotate' : name;
    return `${cssName}(${value})`;
  });
  return css.length > 0 ? css.join(' ') : 'none';
}
