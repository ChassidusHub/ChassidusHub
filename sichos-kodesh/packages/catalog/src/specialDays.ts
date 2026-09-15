import { HDate } from '@hebcal/core';
import { mafteiachDay, mafteiachMonthToken } from './mafteiachMonth.js';
import { mafteiachMonthTokenToHDateMonth } from './hebrewDateKey.js';

export interface SpecialDay {
  /** HDate-native month number (see MAFTEIACH_MONTH_OPTIONS) - the same leap-year-independent convention already used for the month filter, so Purim's regular-year Adar and its Adar-II-in-a-leap-year both stay real, distinct entries here (a leap year genuinely moves Purim to Adar II) without needing separate leap-year bookkeeping. */
  hdateMonth: number;
  day: number;
}

/**
 * Recurring Hebrew-calendar dates - none of them Shabbos, none a real Yom
 * Tov (see occasionChagCategory) - worth their own search filter, the same
 * kind of "which occasion" question a parsha or chag answers. Not guessed:
 * found by auditing the real bundled catalog for every non-Shabbos,
 * non-Yom-Tov date recurring across many years with genuine recorded
 * content, then reviewed by hand against Chabad's own canonical list of
 * yahrzeits, birthdays, and historic geula/redemption days for the
 * Rebbeim - and each of *those* was separately confirmed to actually have
 * real content in this specific catalog too, not assumed from the general
 * list alone (e.g. Gimmel Tamuz has real sichos here precisely because
 * this catalog's years, 5710-5752, predate the Rebbe's own passing in
 * 5754 - for those decades it was still just an ordinary date).
 *
 * Deliberately excludes the "erev [a real Yom Tov]" dates (Erev Rosh
 * Hashana, Erev Yom Kippur, Erev Pesach, Erev Shavuot, Erev Sukkot) even
 * though several of those recur even more often than every date below - a
 * considered choice, not an oversight: those are already naturally
 * discoverable via the Yom Tov itself, unlike the dates below, none of
 * which are the eve of anything already searchable another way.
 */
export const SPECIAL_DAYS: SpecialDay[] = [
  { hdateMonth: 7, day: 3 }, // Tzom Gedaliah
  { hdateMonth: 7, day: 6 },
  { hdateMonth: 7, day: 13 }, // Yahrzeit of the Rebbe Maharash
  { hdateMonth: 8, day: 20 }, // Birthday of the Rebbe Rashab
  { hdateMonth: 9, day: 9 }, // Birthday and yahrzeit of the Mitteler Rebbe
  { hdateMonth: 9, day: 10 }, // The Mitteler Rebbe's release from prison
  { hdateMonth: 9, day: 14 }, // The Rebbe's wedding
  { hdateMonth: 9, day: 19 }, // Yud-Tes Kislev
  { hdateMonth: 9, day: 28 },
  { hdateMonth: 10, day: 5 }, // Didan Notzach
  { hdateMonth: 10, day: 10 }, // Asara B'Teves
  { hdateMonth: 10, day: 24 }, // Yahrzeit of the Alter Rebbe
  { hdateMonth: 11, day: 10 }, // Yud Shevat
  { hdateMonth: 11, day: 11 },
  { hdateMonth: 11, day: 15 }, // Tu B'Shevat
  { hdateMonth: 11, day: 22 }, // Yahrzeit of Rebbetzin Chaya Mushka
  { hdateMonth: 12, day: 2 }, // Yahrzeit of Rebbetzin Shterna Sarah
  { hdateMonth: 12, day: 14 }, // Purim
  { hdateMonth: 13, day: 14 }, // Purim, in a leap year
  { hdateMonth: 1, day: 2 }, // Yahrzeit of the Rebbe Rashab
  { hdateMonth: 1, day: 11 }, // The Rebbe's birthday
  { hdateMonth: 1, day: 13 }, // Yahrzeit of the Tzemach Tzedek
  { hdateMonth: 2, day: 2 }, // Birthday of the Rebbe Maharash
  { hdateMonth: 2, day: 14 }, // Pesach Sheni
  { hdateMonth: 2, day: 18 }, // Lag BaOmer
  { hdateMonth: 3, day: 28 }, // Arrival in the USA
  { hdateMonth: 4, day: 3 }, // Gimmel Tamuz
  { hdateMonth: 4, day: 12 }, // Yud-Beis Tamuz
  { hdateMonth: 4, day: 13 }, // Motzoei Yud-Gimmel Tamuz
  { hdateMonth: 5, day: 14 },
  { hdateMonth: 5, day: 20 }, // Chof Menachem Av
  { hdateMonth: 6, day: 18 }, // Chai Elul
  { hdateMonth: 6, day: 26 },
  { hdateMonth: 6, day: 28 }, // Third day of Selichos
];

function specialDayId(hdateMonth: number, day: number): string {
  return `${hdateMonth}-${day}`;
}

const SPECIAL_DAY_SET: ReadonlySet<string> = new Set(SPECIAL_DAYS.map((d) => specialDayId(d.hdateMonth, d.day)));

/**
 * Which SPECIAL_DAYS entry (by its `${hdateMonth}-${day}` id) an occasion
 * belongs to, or null. Matches by exact date, or by one calendar day
 * either side when the label itself marks it as an "ערב" (eve of) or
 * "מוצאי" (the night concluding) entry - a real reported case, not a
 * hypothetical one: a farbrengen genuinely held the evening before or
 * after a special day is the same occasion, filed under an adjacent date
 * only because Hebrew calendar days run sunset-to-sunset. Trusts the
 * label over blindly matching *any* occasion that happens to land on the
 * adjacent date by pure coincidence - an unrelated occasion one day off
 * shouldn't count just because of proximity.
 */
export function occasionSpecialDay(hebrewDate: string, occasionLabel: string): string | null {
  const hebrewYear = Number(hebrewDate.split('-')[0]);
  const month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate));
  const day = mafteiachDay(hebrewDate);
  const exactId = specialDayId(month, day);
  if (SPECIAL_DAY_SET.has(exactId)) return exactId;

  if (!/^(ערב|מוצאי)/.test(occasionLabel.trim())) return null;

  const hdate = new HDate(day, month, hebrewYear);
  const abs = hdate.abs();
  for (const adjacentAbs of [abs - 1, abs + 1]) {
    const adjacent = new HDate(adjacentAbs);
    const adjacentId = specialDayId(adjacent.getMonth(), adjacent.getDate());
    if (SPECIAL_DAY_SET.has(adjacentId)) return adjacentId;
  }
  return null;
}
