import { describe, expect, it } from 'vitest';
import { translateChapterName } from '../src/translate/chapterNameHe.js';

function expectTranslations(cases: Array<[string, string]>) {
  for (const [en, he] of cases) expect(translateChapterName(en), en).toBe(he);
}

describe('translateChapterName', () => {
  it('translates the examples the Hebrew UI was asked for', () => {
    expectTranslations([
      ['Sicha 1', 'שיחה א׳'],
      ['Ma’amar', 'מאמר'],
      ['Nigun 2', 'ניגון ב׳'],
      ['Two Nigunim', 'שני ניגונים'],
      ['A Few Nigunim', 'כמה ניגונים'],
      ['Nigun Simcha', 'ניגון שמחה'],
    ]);
  });

  it("numbers a chapter in Hebrew numerals, with the Hebrew UI's geresh and gershayim", () => {
    expectTranslations([
      ['Sicha 11', 'שיחה י״א'],
      ['Sicha 15', 'שיחה ט״ו'],
      ['Nigun 16', 'ניגון ט״ז'],
      ['Two Nigunim #3', 'שני ניגונים ג׳'],
      ['Guests – Yiddish 2', 'אורחים - אידיש ב׳'],
      ['Sicha 2 Translation', 'שיחה ב׳ - תרגום'],
      ['3', 'ג׳'],
    ]);
  });

  it('reads every spelling JEM used for one name - apostrophes, case, spacing, a trailing period', () => {
    expectTranslations([
      ["Ma'amar", 'מאמר'],
      ['Maamar', 'מאמר'],
      ['NIgun 1', 'ניגון א׳'],
      ['two Nigunim', 'שני ניגונים'],
      ['Nigun  Hisva’adus', 'ניגון התוועדות'],
      ['Aimosai Ka’asi Mar', 'אימתי קאתי מר'],
      ['End Of Farbrengen', 'סיום ההתוועדות'],
      ['Nigunim and L\'chaims.', 'ניגונים ולחיים'],
    ]);
  });

  it('keeps a nigun by its own name', () => {
    expectTranslations([
      ['Lechatchila Ariber', 'לכתחילה אריבער'],
      ['Nye Zhuritzy Chloptzy 2 (Wordless Melody)', 'ניע זשוריצי כלאפצי ב׳ (ללא מילים)'],
      ['V’harikosi Lachem Bracha (Fast)', 'והריקותי לכם ברכה (מהיר)'],
      ['Nikolaever Nigun (Ro’eh Yisroel)', 'ניגון ניקולייב (רועה ישראל)'],
      ['Daled Bavos', 'ד׳ בבות'],
      ['Twelve Pesukim', 'י״ב פסוקים'],
    ]);
  });

  it('joins "and" and "&" with a ו, and keeps commas and dashes', () => {
    expectTranslations([
      ['Nigunim & Sheva Brachos', 'ניגונים ושבע ברכות'],
      ['L’chaims and Conversations', 'לחיים ושיחות עם הקהל'],
      ['Nigun Hachana, Daled Bavos, Nye Zhuritzy Chloptzi', 'ניגון הכנה, ד׳ בבות, ניע זשוריצי כלאפצי'],
      ['Sicha 4  — Ma’amar K’ein Sicha', 'שיחה ד׳ - מאמר כעין שיחה'],
    ]);
  });

  it('writes JEM dates as Hebrew dates and years', () => {
    expectTranslations([
      ['Sicha, Yud Zayin Tishrei, 5748', 'שיחה, י״ז תשרי, תשמ״ח'],
      ['Farbrengen, Chai Tishrei, 5713', 'התוועדות, י״ח תשרי, תשי״ג'],
      ['Sicha, Chof DaledTishrei, 5750', 'שיחה, כ״ד תשרי, תש״נ'],
      ['Machne Israel, 27 Adar II 5746', 'מחנה ישראל, כ״ז אדר ב׳ תשמ״ו'],
      ['General Audience Chof Daled Nissan, 5748', 'יחידות כללית כ״ד ניסן, תשמ״ח'],
      ['Sicha, Ta\'anis Esther 5748', 'שיחה, תענית אסתר תשמ״ח'],
      ['Sicha, Ohr L\'Chof Daled Teves, 5752', 'שיחה, אור לכ״ד טבת, תשנ״ב'],
      ['Sicha, Leil Hoshana Rabbah, 5747', 'שיחה, ליל הושענא רבה, תשמ״ז'],
      ['Sicha, Shivah Asar B\'Tammuz Nidcheh, 5751', 'שיחה, י״ז בתמוז נדחה, תשנ״א'],
      ['Sicha, 6th Night of Chanuka, 5747', 'שיחה, ליל ו׳ דחנוכה, תשמ״ז'],
      ['Sicha, Rosh Chodesh Teves after Minchah, 5747', 'שיחה, ראש חודש טבת אחרי מנחה, תשמ״ז'],
      ['5730/Tishrei/06', 'ו׳ תשרי תש״ל'],
    ]);
  });

  it('writes the 18th of Elul as Chabad does, ח״י אלול', () => {
    expectTranslations([
      ['Sicha, Chai Elul, 5748', 'שיחה, ח״י אלול, תשמ״ח'],
      ['Minchah, Yud Ches Elul, 5748', 'מנחה, ח״י אלול, תשמ״ח'],
      ['Sicha, 18 Elul', 'שיחה, ח״י אלול'],
      ['5738/Elul/18', 'ח״י אלול תשל״ח'],
      ['Sicha, Yud Ches Tishrei, 5751', 'שיחה, י״ח תשרי, תשנ״א'],
    ]);
  });

  it('names a dollars distribution as one, and a parade as a תהלוכה', () => {
    expectTranslations([
      ['Dollars', 'דולרים'],
      ['Dollars, Chof Teves, 5750', 'חלוקת דולרים, כ׳ טבת, תש״נ'],
      ['Parade', 'תהלוכה'],
      ['End of Parade', 'סיום התהלוכה'],
    ]);
  });

  it('gives no Hebrew for a name it does not know', () => {
    expect(translateChapterName('Vayanchem')).toBeNull();
    expect(translateChapterName('Sicha, Something Unknown')).toBeNull();
    expect(translateChapterName('Sicha, Yud Zayin Nowhere, 5748')).toBeNull();
    expect(translateChapterName('')).toBeNull();
  });
});
