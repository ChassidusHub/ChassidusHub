import { describe, expect, it } from 'vitest';
import type { CatalogRef, LibraryItemBase } from '@sichos-kodesh/catalog';
import { itemAudio, itemFacts, itemPdfLabel, itemPlaylistEntry, itemSubtitle, itemTitle } from '../src/library/libraryModel.js';

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
});
