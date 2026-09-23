import { describe, expect, it } from 'vitest';
import type { CatalogByYear } from '../src/catalogLookup.js';
import { toMafteiachHebrewDateKey } from '../src/hebrewDateKey.js';
import { occasionIdentity, resolveOccasionAllYears, scoreOccasionMatch } from '../src/occasionIdentity.js';
import type { CatalogEntry } from '../src/types.js';

let nextId = 1;
function entry(hebrewYear: number, hebrewDate: string, label: string, hasContent = true): CatalogEntry {
  return {
    occasionId: nextId++,
    hebrewYear,
    hebrewDate,
    occasionLabel: label,
    audio: hasContent ? [{ workerFilename: `${nextId}.mp3`, durationMs: 1000 }] : [],
    pdfs: [],
  };
}

function labels(entries: CatalogEntry[]): string[] {
  return entries.map((e) => e.occasionLabel);
}

describe('occasionIdentity', () => {
  it('reads the holiday and the distinctive detail, drops the time of day and generic words', () => {
    expect(occasionIdentity('ערב יו"כ, ברכת הבנים')).toEqual({ strong: ['יו"כ', 'הבנים'], dateTokens: [], ordinals: [], timeOfDay: 'eve' });
    expect(occasionIdentity('ערב יו"כ, אחרי מנחה')).toEqual({ strong: ['יו"כ'], dateTokens: [], ordinals: [], timeOfDay: 'eve' });
  });

  it('strips the "of the holiday" prefix and keeps the day ordinal', () => {
    expect(occasionIdentity("ליל ב' דחה\"ש")).toEqual({ strong: ['חה"ש'], dateTokens: ["ב'"], ordinals: ["ב'"], timeOfDay: 'night' });
    expect(occasionIdentity("יום ב' דחה\"ש")).toEqual({ strong: ['חה"ש'], dateTokens: ["ב'"], ordinals: ["ב'"], timeOfDay: 'day' });
  });

  it('reads an eve written as one token (עחה"ש) as the eve of that holiday', () => {
    expect(occasionIdentity('במדבר, עחה"ש')).toEqual({ strong: ['במדבר', 'חה"ש'], dateTokens: [], ordinals: [], timeOfDay: 'eve' });
  });

  it('treats a label that is only a date as date-identified, with no strong tokens', () => {
    expect(occasionIdentity('י"ט כסלו')).toEqual({ strong: [], dateTokens: ['י"ט', 'כסלו'], ordinals: [], timeOfDay: null });
    expect(occasionIdentity("וישב, כ' כסלו")).toEqual({ strong: ['וישב'], dateTokens: ["כ'", 'כסלו'], ordinals: ["כ'"], timeOfDay: null });
  });

  it('keeps a parsha after a motzei-Shabbos prefix, and Rosh Hashana despite its gematria shape', () => {
    expect(occasionIdentity('מוצש"פ בראשית')).toEqual({ strong: ['בראשית'], dateTokens: [], ordinals: [], timeOfDay: 'after' });
    expect(occasionIdentity('ליל ב\' דר"ה').strong).toEqual(['ר"ה']);
  });

  it('accepts the Unicode gershayim/geresh spellings as the ASCII ones', () => {
    expect(occasionIdentity('ערב יו״כ, ברכת הבנים')).toEqual(occasionIdentity('ערב יו"כ, ברכת הבנים'));
    expect(occasionIdentity('ליל ב׳ דחה״ש')).toEqual(occasionIdentity("ליל ב' דחה\"ש"));
  });
});

describe('scoreOccasionMatch', () => {
  it('is null when the labels name different occasions', () => {
    expect(scoreOccasionMatch(occasionIdentity('בראשית'), occasionIdentity('שמח"ת'), 3)).toBeNull();
  });

  it('prefers a matching day ordinal over a matching time of day', () => {
    const source = occasionIdentity("ליל ב' דחה\"ש");
    const sameOrdinalNextDay = scoreOccasionMatch(source, occasionIdentity("יום ב' דחה\"ש"), 1)!;
    const sameDayOtherOrdinal = scoreOccasionMatch(source, occasionIdentity("ליל א' דחה\"ש, לפנות בוקר"), 0)!;
    expect(sameOrdinalNextDay).toBeGreaterThan(sameDayOtherOrdinal);
  });
});

describe('resolveOccasionAllYears', () => {
  const erevYK = (year: number) => toMafteiachHebrewDateKey({ year, month: 7, day: 9 });
  const motzeiYK = (year: number) => toMafteiachHebrewDateKey({ year, month: 7, day: 10 });

  it('picks the same farbrengen when several share the date, and lists the rest as others', () => {
    const source = entry(5712, `${erevYK(5712)}b`, 'ערב יו"כ, ברכת הבנים');
    const catalog: CatalogByYear = {
      5712: [entry(5712, erevYK(5712), 'ערב יו"כ, אחרי חצות'), source, entry(5712, motzeiYK(5712), 'מוצאי יו"כ')],
      5713: [entry(5713, erevYK(5713), 'ערב יו"כ, לפנות ערב'), entry(5713, `${erevYK(5713)}b`, 'ערב יו"כ, ברכת הבנים')],
    };

    const result = resolveOccasionAllYears(catalog, source);

    expect(result.map((r) => r.hebrewYear)).toEqual([5712, 5713]);
    expect(labels(result[0]!.matches)).toEqual(['ערב יו"כ, ברכת הבנים']);
    expect(labels(result[0]!.others)).toEqual(['ערב יו"כ, אחרי חצות']);
    expect(labels(result[1]!.matches)).toEqual(['ערב יו"כ, ברכת הבנים']);
    expect(labels(result[1]!.others)).toEqual(['ערב יו"כ, לפנות ערב']);
  });

  it('follows the second day of a Yom Tov to the next date rather than the first day on the same date', () => {
    const sivan = (year: number, day: number) => toMafteiachHebrewDateKey({ year, month: 3, day });
    const source = entry(5711, `${sivan(5711, 6)}b`, "ליל ב' דחה\"ש");
    const catalog: CatalogByYear = {
      5711: [entry(5711, sivan(5711, 6), "יום א' דחה\"ש, אחרי מנחה"), source, entry(5711, sivan(5711, 7), "יום ב' דחה\"ש")],
      5712: [entry(5712, sivan(5712, 5), 'ערב חה"ש'), entry(5712, `${sivan(5712, 5)}b`, "ליל א' דחה\"ש, לפנות בוקר"), entry(5712, sivan(5712, 7), "יום ב' דחה\"ש")],
    };

    const result = resolveOccasionAllYears(catalog, source);

    expect(labels(result[1]!.matches)).toEqual(["יום ב' דחה\"ש"]);
    expect(result[1]!.others).toEqual([]);
  });

  it('matches an eve written as one token with an eve written as a word, a day apart or not', () => {
    const sivan = (year: number, day: number) => toMafteiachHebrewDateKey({ year, month: 3, day });
    const source = entry(5712, sivan(5712, 5), 'ערב חה"ש');
    const catalog: CatalogByYear = {
      5711: [entry(5711, sivan(5711, 5), 'במדבר, עחה"ש')],
      5712: [source],
      5713: [entry(5713, sivan(5713, 4), 'ליל ערב חה"ש')],
    };

    const result = resolveOccasionAllYears(catalog, source);

    expect(result.map((r) => [r.hebrewYear, labels(r.matches)])).toEqual([
      [5711, ['במדבר, עחה"ש']],
      [5712, ['ערב חה"ש']],
      [5713, ['ליל ערב חה"ש']],
    ]);
  });

  it('follows a Shabbos parsha to its own date in another year instead of whatever fell on the same date', () => {
    const tishrei = (year: number, day: number) => toMafteiachHebrewDateKey({ year, month: 7, day });
    const source = entry(5736, tishrei(5736, 27), 'בראשית');
    const catalog: CatalogByYear = {
      5736: [source],
      5740: [entry(5740, tishrei(5740, 23), 'שמח"ת'), entry(5740, tishrei(5740, 24), 'בראשית'), entry(5740, tishrei(5740, 27), 'שיחה להת\' שי\'')],
    };

    const result = resolveOccasionAllYears(catalog, source);

    expect(labels(result[1]!.matches)).toEqual(['בראשית']);
    expect(labels(result[1]!.others)).toEqual(["שיחה להת' שי'"]);
  });

  it('matches a date-only label by its date, across a leap/non-leap boundary', () => {
    // 5712 is not a leap year (plain Adar, "06"); 5711 is (Adar I, "06A") - the same HDate month 12 either way.
    const source = entry(5712, toMafteiachHebrewDateKey({ year: 5712, month: 12, day: 14 }), 'פורים קטן');
    const catalog: CatalogByYear = {
      5711: [entry(5711, toMafteiachHebrewDateKey({ year: 5711, month: 12, day: 14 }), 'פורים קטן')],
      5712: [source],
      5713: [entry(5713, toMafteiachHebrewDateKey({ year: 5713, month: 12, day: 14 }), 'gap', false)],
    };

    const result = resolveOccasionAllYears(catalog, source);

    expect(result.map((r) => r.hebrewYear)).toEqual([5711, 5712]);
  });

  it('omits years with nothing on or near the date', () => {
    const source = entry(5711, toMafteiachHebrewDateKey({ year: 5711, month: 11, day: 10 }), 'יו"ד שבט');
    const catalog: CatalogByYear = {
      5711: [source],
      5713: [entry(5713, toMafteiachHebrewDateKey({ year: 5713, month: 7, day: 1 }), 'unrelated')],
    };

    expect(resolveOccasionAllYears(catalog, source).map((r) => r.hebrewYear)).toEqual([5711]);
  });
});
