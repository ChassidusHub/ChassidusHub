import { describe, expect, it } from 'vitest';
import { translateOccasionLabel } from '../src/translate/occasionLabelEn.js';

function expectTranslations(cases: Array<[string, string]>) {
  for (const [he, en] of cases) expect(translateOccasionLabel(he), he).toBe(en);
}

describe('translateOccasionLabel', () => {
  it('translates the examples the English UI was asked for', () => {
    expectTranslations([
      [`יום ב' דר"ה`, 'Rosh Hashanah, day 2'],
      [`ו' תשרי`, '6 Tishrei'],
      [`האזינו, ש"ת`, 'Haazinu, Shabbos Shuvah'],
      [`ערב יו"כ, אחרי מנחה`, 'Erev Yom Kippur, after Mincha'],
      [`מוצאי י"ג תשרי`, 'Motzei 13 Tishrei'],
      [`ליל שמח"ת, לפני הקפות`, 'Simchas Torah night, before hakafos'],
      [`בראשית, מבה"ח וער"ח מ"ח`, 'Bereishis, Shabbos Mevarchim and Erev Rosh Chodesh Cheshvan'],
    ]);
  });

  it('reads Hebrew numerals, including the Chabad spellings that are not a plain letter sum', () => {
    expectTranslations([
      [`י"ט כסלו`, '19 Kislev'],
      [`יו"ד שבט`, '10 Shevat'],
      [`ז"ך אלול, שיחה לנשי ובנות חב"ד`, "27 Elul, sicha to N'shei uBnos Chabad"],
      [`טו"ב כסלו, לפני מנחה`, '17 Kislev, before Mincha'],
      [`ליל כ"ף מ"ח, שיחה לעסקני הישיבה`, 'Night of 20 Cheshvan, sicha to the supporters of the yeshivah'],
      [`ח"י אלול`, '18 Elul'],
      [`י"ד-ט"ז שבט, במשך ימי השבעה`, '14-16 Shevat, during the shivah'],
    ]);
  });

  it("uses the app's month names, with Menachem Av and the two Adars as the labels write them", () => {
    expectTranslations([
      [`כ' מנ"א`, '20 Menachem Av'],
      [`תרומה, ד' אד"ר`, 'Terumah, 4 Adar I'],
      [`פקודי, ב' אד"ש`, 'Pekudei, 2 Adar II'],
      [`נח, ו' מרחשון`, 'Noach, 6 Cheshvan'],
      [`ב׳ כסלו, אחרי מעריב`, '2 Kislev, after Maariv'],
      [`חודש תשרי, תשמ"א`, 'The month of Tishrei, 5741'],
      [`חורף תשכ"ד`, 'Winter 5724'],
    ]);
  });

  it('names the parshiyos the Chabad way, doubled ones included', () => {
    expectTranslations([
      [`ויק"פ, פ' החודש, מבה"ח ניסן`, 'Vayakhel-Pekudei, Parshas Hachodesh, Shabbos Mevarchim Nisan'],
      [`תזו"מ, ג' אייר`, 'Tazria-Metzora, 3 Iyar'],
      [`נצו"י, כ"ה אלול`, 'Nitzavim-Vayeilech, 25 Elul'],
      [`תשא, פ' פרה`, 'Ki Sisa, Parshas Parah'],
      [`דברים, חזון`, 'Devarim, Shabbos Chazon'],
      [`ואתחנן, נחמו`, "Va'eschanan, Shabbos Nachamu"],
      [`מוצש"פ בשלח, יו"ד שבט`, 'Motzei Shabbos Beshalach, 10 Shevat'],
      [`ליל ש"פ בשלח, מוצאי יו"ד שבט, אחרי קבלת שבת`, 'Shabbos Beshalach night, Motzei 10 Shevat, after Kabbalas Shabbos'],
      [`כ"ד תמוז, ערש"פ מטו"מ, מבה"ח מנ"א`, '24 Tamuz, Erev Shabbos Matos-Masei, Shabbos Mevarchim Menachem Av'],
    ]);
  });

  it('tells the parsha אחרי from "after" by what follows', () => {
    expectTranslations([
      [`אחרי, מבה"ח אייר`, 'Acharei, Shabbos Mevarchim Iyar'],
      [`ר"ח סיון, אחרי מנחה`, 'Rosh Chodesh Sivan, after Mincha'],
    ]);
  });

  it('numbers the days and nights of a Yom Tov, Chol Hamoed, Rosh Chodesh and Chanukah', () => {
    expectTranslations([
      [`ליל ב' דחה"פ`, 'Pesach, night 2'],
      [`ליל ד' דחה"ס, ב' דחוה"מ, אחרי מעריב - שמב"ה`, 'Sukkos, night 4, Chol Hamoed, day 2, after Maariv - Simchas Beis Hashoevah'],
      [`נח, בדר"ח מ"ח`, 'Noach, Rosh Chodesh Cheshvan, day 2'],
      [`ליל אדר"ח אייר`, 'Rosh Chodesh Iyar, night 1'],
      [`ער"ח סיון, אחרי מנחה`, 'Erev Rosh Chodesh Sivan, after Mincha'],
      [`ג' דסליחות, כ"ו אלול`, 'Selichos, day 3, 26 Elul'],
      [`ב' דחנוכה, אחרי מנחה`, 'Chanukah, day 2, after Mincha'],
      [`נר ה' דחנוכה, שיחה לעסקני הישיבה`, '5th Chanukah light, sicha to the supporters of the yeshivah'],
      [`כ"ח כסלו, אור לנר ה' דחנוכה, אחרי מנחה, שיחה לצבאות ה'`, '28 Kislev, eve of the 5th Chanukah light, after Mincha, sicha to Tzivos Hashem'],
    ]);
  });

  it('puts "night" after a named day and "night of" before a date', () => {
    expectTranslations([
      [`ליל ט"ו בשבט`, "Tu B'Shevat night"],
      [`ליל ערב חה"ש`, 'Erev Shavuos night'],
      [`ליל י"ג ניסן`, 'Night of 13 Nisan'],
      [`מוצש"פ צו, ליל י"ג ניסן`, 'Motzei Shabbos Tzav, night of 13 Nisan'],
      [`יום שמח"ת`, 'Simchas Torah day'],
    ]);
  });

  it('keeps the named fasts and days by name', () => {
    expectTranslations([
      [`צום גדלי' (נדחה), אחרי מנחה`, 'Tzom Gedaliah (postponed), after Mincha'],
      [`יו"ד בטבת, אחרי מנחה`, "Asarah B'Teves, after Mincha"],
      [`י"ז בתמוז, אחרי מנחה`, "Shivah Asar B'Tamuz, after Mincha"],
      [`דברים, חזון, ט' באב - נדחה`, "Devarim, Shabbos Chazon, Tishah B'Av - postponed"],
      [`ל"ג בעומר, שיחה בעת הפאראד`, 'Lag BaOmer, sicha during the parade'],
      [`אחש"פ`, 'Acharon shel Pesach'],
      [`ימים ראשונים דחה"ס, בעת הסעודה`, 'The first days of Sukkos, during the meal'],
    ]);
  });

  it('translates who a sicha, bracha or yechidus was for', () => {
    expectTranslations([
      [`כ"ד אלול, שיחה להעסקניות דישיבות תות"ל ו"בית רבקה" תחי'`, '24 Elul, sicha to the women supporters of the Tomchei Temimim yeshivos and Beis Rivkah'],
      [`ג' אייר, ברכה להת' השלוחים הנוסעים לסיאטל`, '3 Iyar, bracha to the student shluchim traveling to Seattle'],
      [`י"א שבט, שיחה לצעירי תלמידי תות"ל דמאנטריעאל שי'`, '11 Shevat, sicha to the young students of Tomchei Temimim of Montreal'],
      [
        `ליל ט"ו תמוז, יחידות כללית (לקבוצת אורחים; קבוצת חתני בר מצוה והוריהם; קבוצת חתנים וכלות)`,
        'Night of 15 Tamuz, general yechidus (for a group of guests; a group of bar mitzvah boys and their parents; a group of brides and grooms)',
      ],
      [`ט' אד"ר, בעת ביקור האדמו"ר מבעלז`, '9 Adar I, during the visit of the Belzer Rebbe'],
    ]);
  });

  it('keeps a yechidus list\'s places as "to" while its groups read "for"', () => {
    expect(translateOccasionLabel(`כ"ט תשרי, אדר"ח מ"ח, יחידות כללית (להת' החוזרים לאה"ק ת"ו; קבוצת בחורות מארה"ק)`)).toBe(
      '29 Tishrei, Rosh Chodesh Cheshvan, day 1, general yechidus (for the students returning to Eretz Yisroel; a group of young women from Eretz Yisroel)',
    );
  });

  it('reads the second farbrengen of a day and its continuation', () => {
    expectTranslations([
      [`בראשית, מבה"ח מ"ח (התוועדות א)`, 'Bereishis, Shabbos Mevarchim Cheshvan (farbrengen 1)'],
      [`בראשית (התוועדות ב - המשך לשמח"ת)`, 'Bereishis (farbrengen 2 - continuing Simchas Torah)'],
      [`בראשית, (התוועדות ב המשך משמח"ת)`, 'Bereishis, (farbrengen 2, continued from Simchas Torah)'],
    ]);
  });

  it('reads a label written without its commas, with Hebrew geresh and gershayim, or with a trailing comma', () => {
    expectTranslations([
      [`ויגש ז' טבת`, 'Vayigash, 7 Teves'],
      [`תולדות מבה"ח וער"ח כסלו`, 'Toldos, Shabbos Mevarchim and Erev Rosh Chodesh Kislev'],
      [`מוצאי י״א ניסן`, 'Motzei 11 Nisan'],
      [`וישב, חנוכה, מבה"ח טבת,`, 'Vayeishev, Chanukah, Shabbos Mevarchim Teves'],
      [`[ט"ז מ"ח, יחידות פרטית]`, '[16 Cheshvan, private yechidus]'],
    ]);
  });

  it('gives no English for a label with any part it does not know', () => {
    expect(translateOccasionLabel(`תמוז, ר"ד לפני הנשים מוואסטער`)).toBeNull();
    expect(translateOccasionLabel(`ט"ו אייר, בעת ביקור ח.ל.`)).toBeNull();
    expect(translateOccasionLabel('ונזכה זעהן זיך מיט\'ן רבי\'ן דא למטה')).toBeNull();
    expect(translateOccasionLabel('')).toBeNull();
    expect(translateOccasionLabel('Yud Shevat, 5711')).toBeNull();
  });

  it('never reads a day number that is out of range as a date', () => {
    expect(translateOccasionLabel(`ל"ה תשרי`)).toBeNull();
    expect(translateOccasionLabel(`ט' דחה"ס`)).toBe('Sukkos, day 9');
    expect(translateOccasionLabel(`י"ב דחה"ס`)).toBeNull();
  });
});
