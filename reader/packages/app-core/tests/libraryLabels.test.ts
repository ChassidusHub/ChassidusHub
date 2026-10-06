import { describe, expect, it } from 'vitest';
import type { CatalogRef, LibraryItemBase } from '@chassidushub-reader/catalog';
import { itemAudio, itemDescription, itemFacts, itemPdfLabel, itemPlaylistEntry, itemSubtitle, itemTitle, volumeSections } from '../src/library/libraryModel.js';

// Items as the library files have them (apps/mobile/src/catalog/data/library), trimmed.
const sicha = {
  id: '1:1',
  label: `ח"א ע' 1 (בראשית)`,
  volume: 1,
  page: 1,
  sectionLabel: 'בראשית',
  sectionLabelEn: 'Bereishis',
  hasTranslated: true,
  hasKitzur: true,
  refs: [
    { kind: 'pdf', sourceId: 'a', role: 'sicha', label: 'שיחה' },
    { kind: 'pdf', sourceId: 'b', role: 'translated', label: 'מתורגם' },
  ],
} as LibraryItemBase;

const recording = {
  id: '11160',
  label: 'Farbrengen, Purim, 5722',
  labelHe: 'התוועדות, פורים, תשכ״ב',
  name: 'Farbrengen, Purim, 5722',
  type: 'Farbrengen',
  typeHe: 'התוועדות',
  hasTranscript: false,
  hebrewYear: 5722,
  hebrewDate: '5722-06-14',
  refs: [{ kind: 'audio', sourceId: 'x.mp3', role: '0', label: 'Sicha 1', labelHe: 'שיחה א׳', durationMs: 60000 }],
} as LibraryItemBase;

const maamar = {
  id: '1',
  label: 'באתי לגני',
  diburHamaschil: 'באתי לגני',
  occasionLabel: `יו"ד שבט`,
  occasionLabelEn: 'Yud Shevat',
  melukatVolumes: [1],
  citations: [],
  hebrewYear: 5711,
  hebrewDate: '5711-05-10',
  refs: [],
} as LibraryItemBase;

const reshima = { id: '9', label: `חוה"מ סוכות`, labelEn: 'Chol HaMoed Sukkos', occasionId: 9, refs: [] } as LibraryItemBase;

const roleNames = { sicha: 'שיחה', translated: 'תרגום', mugah: 'מוגה' };

describe('the library labels', () => {
  it('names a sicha by volume and page, its parsha said once, below it', () => {
    expect(itemTitle('likkuteiSichos', sicha, 'he')).toBe(`ח"א ע' 1`);
    expect(itemSubtitle('likkuteiSichos', sicha, 'he')).toBe('בראשית');
    expect(itemSubtitle('likkuteiSichos', sicha, 'en')).toBe('Bereishis');
  });

  it("names a file by its kind when mafteiach's label only says the kind: 'תרגום', not 'תרגום · מתורגם'", () => {
    const [text, translation] = sicha.refs as [CatalogRef, CatalogRef];
    expect(itemPdfLabel(text, roleNames, 'Documents')).toBe('שיחה');
    expect(itemPdfLabel(translation, roleNames, 'Documents')).toBe('תרגום');
    expect(itemPdfLabel(translation, { translated: 'Translation' }, 'Documents')).toBe('Translation');
    // A label that says more than the kind keeps it.
    expect(itemPdfLabel({ kind: 'pdf', sourceId: 'c', role: 'mugah', label: `לקו"ש חי"ט ע' 291` }, roleNames, 'Documents')).toBe(`מוגה · לקו"ש חי"ט ע' 291`);
  });

  it('names a michtav\'s copies plainly by language: the Hebrew mugah is "מוגה", the English "מוגה בתרגום לאנגלית"', () => {
    const doc = (role: string, label: string): CatalogRef => ({ kind: 'pdf', sourceId: 'x', role, label });
    expect(itemPdfLabel(doc('he:mugah', 'לה"ק - מוגה'), roleNames, 'Documents', 'he')).toBe('מוגה');
    expect(itemPdfLabel(doc('en:mugah', 'English - מוגה'), roleNames, 'Documents', 'he')).toBe('מוגה בתרגום לאנגלית');
    expect(itemPdfLabel(doc('yi:mugah', 'אידיש - מוגה'), roleNames, 'Documents', 'he')).toBe('מוגה באידיש');
    expect(itemPdfLabel(doc('he:תרגום', 'לה"ק - תרגום'), roleNames, 'Documents', 'he')).toBe('תרגום ללשון הקודש');
    expect(itemPdfLabel(doc('en:Translation', 'English - Translation'), roleNames, 'Documents', 'he')).toBe('תרגום לאנגלית');
    expect(itemPdfLabel(doc('he:mugah', 'לה"ק - מוגה'), roleNames, 'Documents', 'en')).toBe('Mugah (Lashon HaKodesh)');
    expect(itemPdfLabel(doc('en:mugah', 'English - מוגה'), roleNames, 'Documents', 'en')).toBe('Mugah (English)');
  });

  it('opens a Likkutei Sichos volume on its parshiyos, in the volume\'s order', () => {
    const at = (id: string, he: string, en: string) => ({ ...sicha, id, sectionLabel: he, sectionLabelEn: en });
    const items = [at('1:1', 'בראשית', 'Bereishis'), at('1:2', 'בראשית', 'Bereishis'), at('1:9', 'נח', 'Noach'), at('1:15', 'לך לך', 'Lech Lecha')];
    const sections = volumeSections('likkuteiSichos', 'volume', items)!;
    expect(sections.map((s) => [s.name.he, s.name.en, s.items.map((i) => i.id)])).toEqual([
      ['בראשית', 'Bereishis', ['1:1', '1:2']],
      ['נח', 'Noach', ['1:9']],
      ['לך לך', 'Lech Lecha', ['1:15']],
    ]);
    expect(volumeSections('likkuteiSichos', 'parsha', items)).toBeNull();
    expect(volumeSections('likkuteiSichos', 'volume', items.slice(0, 2))).toBeNull();
  });

  it('says nothing about a sicha\'s translation on top: its documents list it', () => {
    const words = { saidAt: '', printedIn: '', hemshech: () => '', kuntres: () => '', hasTranslation: 'יש תרגום', hasTranscript: '' };
    expect(itemFacts('likkuteiSichos', sicha, words, 'he')).toEqual([]);
  });

  it("gives JEM's recordings their Hebrew names in the Hebrew interface, and keeps JEM's English in the English one", () => {
    expect(itemTitle('jemEvents', recording, 'he')).toBe('התוועדות, פורים, תשכ״ב');
    expect(itemTitle('jemEvents', recording, 'en')).toBe('Farbrengen, Purim, 5722');
    expect(itemSubtitle('jemEvents', recording, 'he').startsWith('התוועדות · ')).toBe(true);
    expect(itemAudio(recording)).toEqual([{ workerFilename: 'x.mp3', durationMs: 60000, chapterName: 'Sicha 1', chapterNameHe: 'שיחה א׳' }]);
    const entry = itemPlaylistEntry('jemEvents', recording)!;
    expect([entry.occasionLabel, entry.occasionLabelEn]).toEqual(['התוועדות, פורים, תשכ״ב', 'Farbrengen, Purim, 5722']);
  });

  it("gives mafteiach's Hebrew names their English in the English interface", () => {
    expect(itemTitle('maamorim', maamar, 'en')).toBe('באתי לגני');
    expect(itemSubtitle('maamorim', maamar, 'en').startsWith('Yud Shevat · ')).toBe(true);
    expect(itemFacts('maamorim', maamar, { saidAt: 'Said at', printedIn: '', hemshech: () => '', kuntres: () => '', hasTranslation: '', hasTranscript: '' }, 'en')).toEqual(['Said at: Yud Shevat']);
    expect(itemTitle('reshimos', reshima, 'en')).toBe('Chol HaMoed Sukkos');
    expect(itemTitle('reshimos', reshima, 'he')).toBe(`חוה"מ סוכות`);
    expect(itemPlaylistEntry('reshimos', reshima)).toBeNull();
  });

  it('titles a long name by its short form in either language, and gives the whole name as the description', () => {
    const letter = {
      id: '7',
      label: 'מכתב כללי לחודש תשרי, אל בני ובנות ישראל בכל מקום שהם',
      labelEn: 'General letter for Tishrei, to the Jewish people wherever they are',
      labelShort: 'מכתב כללי לחודש תשרי',
      labelShortEn: 'General letter for Tishrei',
      refs: [],
    } as LibraryItemBase;
    expect(itemTitle('michtavimKlolim', letter, 'he')).toBe('מכתב כללי לחודש תשרי');
    expect(itemTitle('michtavimKlolim', letter, 'en')).toBe('General letter for Tishrei');
    expect(itemDescription('michtavimKlolim', letter, 'en')).toBe(letter.labelEn);
    expect(itemDescription('michtavimKlolim', { ...letter, labelShort: undefined, labelShortEn: undefined } as LibraryItemBase, 'he')).toBeUndefined();
  });
});
