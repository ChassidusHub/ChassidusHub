import { describe, expect, it } from 'vitest';
import { isHighlightedFarbrengenHanacha } from '../src/farbrengenContent.js';
import type { CatalogPdf } from '../src/types.js';

function pdf(section: CatalogPdf['section'], label: string): CatalogPdf {
  return { section, label, driveFileId: 'x' };
}

describe('isHighlightedFarbrengenHanacha', () => {
  it('is true for a real Sichos Kodesh biltiMugah citation', () => {
    expect(isHighlightedFarbrengenHanacha(pdf('biltiMugah', 'שיחו"ק/ ח"ב ע\' 512 (יו"ד שבט)'))).toBe(true);
  });

  it('is true for a real Toras Menachem biltiMugah citation', () => {
    expect(isHighlightedFarbrengenHanacha(pdf('biltiMugah', 'תו"מ התוועדויות'))).toBe(true);
  });

  it('is false for a biltiMugah citation to something else entirely (a real, minority case)', () => {
    expect(isHighlightedFarbrengenHanacha(pdf('biltiMugah', 'הנחה מילולית'))).toBe(false);
    expect(isHighlightedFarbrengenHanacha(pdf('biltiMugah', 'אג"ק ח"א אגרת פה'))).toBe(false);
  });

  it('is false for mugah, even when it cites Toras Menachem or Sichos Kodesh - the edited text is never "the highlighted hanacha"', () => {
    expect(isHighlightedFarbrengenHanacha(pdf('mugah', 'תו"מ התוועדויות'))).toBe(false);
    expect(isHighlightedFarbrengenHanacha(pdf('mugah', 'שיחו"ק'))).toBe(false);
  });

  it('is false for maamorim and hagahos regardless of label', () => {
    expect(isHighlightedFarbrengenHanacha(pdf('maamorim', 'סה"מ מלוקט ח"א'))).toBe(false);
    expect(isHighlightedFarbrengenHanacha(pdf('hagahos', 'עלי הגהה'))).toBe(false);
  });
});
