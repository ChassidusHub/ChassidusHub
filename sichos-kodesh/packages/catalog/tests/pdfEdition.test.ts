import { describe, expect, it } from 'vitest';
import { classifyPdfEdition, sortPdfsByEditionPreference } from '../src/pdfEdition.js';
import type { CatalogPdf } from '../src/types.js';

function pdf(label: string, driveFileId: string): CatalogPdf {
  return { section: 'mugah', label, driveFileId };
}

describe('classifyPdfEdition', () => {
  it('classifies a real Sefer HaSichos citation', () => {
    expect(classifyPdfEdition('סה"ש')).toEqual(['sefer']);
  });

  it('classifies a real Sefer HaMaamarim citation', () => {
    expect(classifyPdfEdition('סה"מ מלוקט ח"א')).toEqual(['sefer']);
  });

  it('classifies a real Toras Menachem citation', () => {
    expect(classifyPdfEdition('תו"מ התוועדויות')).toEqual(['torasMenachem']);
  });

  it('classifies a real label citing both together', () => {
    expect(classifyPdfEdition('סה"ש/ תו"מ התוועדויות')).toEqual(['sefer', 'torasMenachem']);
    expect(classifyPdfEdition('תו"מ התוועדויות/ תו"מ סה"מ')).toEqual(['sefer', 'torasMenachem']);
  });

  it('returns no edition for an edition-agnostic label (e.g. a hagahos scan)', () => {
    expect(classifyPdfEdition('צילום 1')).toEqual([]);
    expect(classifyPdfEdition('שיחו"ק')).toEqual([]);
  });
});

describe('sortPdfsByEditionPreference', () => {
  const sefer = pdf('סה"ש', 'a');
  const tm = pdf('תו"מ התוועדויות', 'b');
  const other = pdf('שיחו"ק', 'c');

  it('leaves order untouched with no preference', () => {
    expect(sortPdfsByEditionPreference([tm, sefer, other], null)).toEqual([tm, sefer, other]);
  });

  it('puts the preferred edition first without dropping the rest', () => {
    expect(sortPdfsByEditionPreference([other, tm, sefer], 'sefer').map((p) => p.driveFileId)).toEqual(['a', 'c', 'b']);
    expect(sortPdfsByEditionPreference([other, tm, sefer], 'torasMenachem').map((p) => p.driveFileId)).toEqual(['b', 'c', 'a']);
  });

  it('preserves relative order among equally-matching (or equally non-matching) items', () => {
    const seferA = pdf('סה"ש (משולב)', 'x');
    const seferB = pdf('סה"ש/ תו"מ התוועדויות (בלה"ק)', 'y');
    expect(sortPdfsByEditionPreference([seferA, seferB], 'sefer').map((p) => p.driveFileId)).toEqual(['x', 'y']);
  });
});
