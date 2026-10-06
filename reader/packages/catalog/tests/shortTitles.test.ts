import { describe, expect, it } from 'vitest';
import { shortenCatalogYear, shortenLibrary } from '../src/translate/shortTitles.js';
import type { CatalogLibrary } from '../src/library/types.js';
import type { CatalogEntry } from '../src/types.js';

const table = {
  he: { 'י"א ניסן, יחידות כללית (לקבוצת אורחים; חתנים וכלות)': 'י"א ניסן, יחידות כללית', 'רשימה ארוכה מאוד מאוד': 'רשימה' },
  en: { '11 Nisan, general yechidus (for a group of guests; brides and grooms)': '11 Nisan, general yechidus' },
};

const entry = (occasionLabel: string, occasionLabelEn?: string): CatalogEntry => ({
  occasionId: 1,
  hebrewYear: 5740,
  hebrewDate: '5740-07-11',
  occasionLabel,
  ...(occasionLabelEn ? { occasionLabelEn } : {}),
  audio: [],
  pdfs: [],
});

describe('the short titles', () => {
  it('sit beside the long names, in the year file order, and only where the table has them', () => {
    const [long, short] = shortenCatalogYear(
      [entry('י"א ניסן, יחידות כללית (לקבוצת אורחים; חתנים וכלות)', '11 Nisan, general yechidus (for a group of guests; brides and grooms)'), entry('ש"פ נח', 'Noach')],
      table,
    );
    expect(Object.keys(long!)).toEqual(['occasionId', 'hebrewYear', 'hebrewDate', 'occasionLabel', 'occasionLabelEn', 'occasionLabelShort', 'occasionLabelShortEn', 'audio', 'pdfs']);
    expect(long!.occasionLabelShort).toBe('י"א ניסן, יחידות כללית');
    expect(long!.occasionLabelShortEn).toBe('11 Nisan, general yechidus');
    expect(short).toEqual(entry('ש"פ נח', 'Noach'));
  });

  it('are applied again from scratch, so a name the table drops loses its short title', () => {
    const once = shortenCatalogYear([entry('רשימה ארוכה מאוד מאוד')], table);
    expect(once[0]!.occasionLabelShort).toBe('רשימה');
    expect(shortenCatalogYear(once, { he: {}, en: {} })[0]).toEqual(entry('רשימה ארוכה מאוד מאוד'));
  });

  it("shorten where a maamar was said and the reshimos' names", () => {
    const library = {
      moadim: [],
      parshiyos: [],
      collections: {
        likkuteiSichos: { items: [], groups: {} },
        maamorim: { items: [{ id: 'm', label: 'm', diburHamaschil: 'באתי לגני', occasionLabel: 'י"א ניסן, יחידות כללית (לקבוצת אורחים; חתנים וכלות)', melukatVolumes: [], citations: [], refs: [] }], groups: {} },
        reshimos: { items: [{ id: 'r', label: 'רשימה ארוכה מאוד מאוד', refs: [] }], groups: {} },
        yomanim: { items: [], groups: {} },
        michtavimKlolim: { items: [], groups: {} },
        hadranim: { items: [], groups: {} },
        jemEvents: { items: [], groups: {} },
      },
    } as unknown as CatalogLibrary;
    const shortened = shortenLibrary(library, table);
    expect(shortened.collections.maamorim.items[0]!.occasionLabelShort).toBe('י"א ניסן, יחידות כללית');
    expect(shortened.collections.reshimos.items[0]!.labelShort).toBe('רשימה');
    expect(library.collections.reshimos.items[0]!.labelShort).toBeUndefined();
  });
});
