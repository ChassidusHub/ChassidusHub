import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_LOOK, parsePdfLook, pdfCssFilter, pdfFilters } from '../src/pdf/pdfLook.js';

describe('the PDF look', () => {
  it('reads what was stored, and falls back to the defaults for anything missing or unknown', () => {
    expect(parsePdfLook(null)).toEqual(DEFAULT_PDF_LOOK);
    expect(parsePdfLook('not json')).toEqual(DEFAULT_PDF_LOOK);
    expect(parsePdfLook(JSON.stringify({ tint: 'sepia', contrast: true, paging: 'pages', keepAwake: true }))).toEqual({ tint: 'sepia', contrast: true, paging: 'pages', keepAwake: true });
    expect(parsePdfLook(JSON.stringify({ tint: 'purple', paging: 7 }))).toEqual(DEFAULT_PDF_LOOK);
  });

  it('draws the pages through one filter, the same on the web and the phone', () => {
    expect(pdfFilters('original', false)).toEqual([]);
    expect(pdfCssFilter('original', false)).toBe('none');
    expect(pdfCssFilter('dark', false)).toBe('invert(1) hue-rotate(180deg)');
    expect(pdfCssFilter('sepia', true)).toBe('sepia(0.45) brightness(0.97) contrast(1.35)');
    expect(pdfFilters('gray', false)).toEqual([{ grayscale: 1 }]);
  });
});
