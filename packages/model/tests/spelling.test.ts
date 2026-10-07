import { describe, expect, it } from 'vitest';
import { spellingHints, tidyHeard, toHouseSpelling } from '@chassidushub/model';

describe('the house spelling', () => {
  it('points out words written other than the booklets do, once each', () => {
    expect(spellingHints('ער האט אויכעט געזאגט, אויכעט דעמולט: אראפבריינגען ע״י')).toEqual([
      { written: '׳ ״', house: `' "` },
      { written: 'אויכעט', house: 'אויך' },
      { written: 'דעמולט', house: 'דעמאלט' },
      { written: 'אראפבריינגען', house: 'אראפברענגען' },
    ]);
    expect(spellingHints('ער האט אויך געזאגט')).toEqual([]);
    // עם is often Loshon Kodesh: never hinted.
    expect(spellingHints('מען דארף געבן עם')).toEqual([]);
  });

  it('rewrites a text the way the training run does, עם as אים except in Loshon Kodesh', () => {
    expect(toHouseSpelling('ער האט עם אויכעט געזאגט, מ׳בריינגט עם ישראל ע״י')).toBe(`ער האט אים אויך געזאגט, מ'ברענגט עם ישראל ע"י`);
  });

  it("sets apart words a ' left glued, and keeps Yiddish endings and prefixes on their word", () => {
    // Words the booklets' text glued (the models learned it), as people fixing transcripts set them apart.
    expect(toHouseSpelling("הוי'אלקיך ראי'פון וכו'וכו. עלי'מאלי'זאל ה'פון ד'אמות")).toBe("הוי' אלקיך ראי' פון וכו' וכו. עלי' מאלי' זאל ה' פון ד' אמות");
    expect(toHouseSpelling("רבי'ן, פסק'נט חסיד'ישע גוי'שקייט גע'פועל אפגע'פסק'נט יעקב'ס איבער'חזר'ן, ס'איז מ'האט")).toBe("רבי'ן, פסק'נט חסיד'ישע גוי'שקייט גע'פועל אפגע'פסק'נט יעקב'ס איבער'חזר'ן, ס'איז מ'האט");
  });

  it('marks an abbreviation with ״ however it was written', () => {
    expect(toHouseSpelling(`רש'י הקב'ה רמב'ם הקב,"ה, חז.ל הש'ס ע"י`)).toBe(`רש"י הקב"ה רמב"ם הקב"ה, חז"ל הש"ס ע"י`);
  });

  it("tidies a machine transcript: abbreviations heard as words written as abbreviations", () => {
    expect(tidyHeard("און עאכו כמה וכמה, משא נכן ביי חב אד, רש'זאגט הקב'איז")).toBe(`און עאכו"כ, משא"כ ביי חב"ד, רש"י זאגט הקב"ה איז`);
  });
});
