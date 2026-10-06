import { HDate } from '@hebcal/core';
import { entryHasContent } from './catalogLookup.js';
import type { CatalogByYear } from './catalogLookup.js';
import { mafteiachMonthTokenToHDateMonth } from './hebrewDateKey.js';
import { mafteiachDay, mafteiachMonthToken } from './mafteiachMonth.js';
import type { CatalogEntry } from './types.js';

/**
 * "This occasion, every year" needs to know which of a year's occasions
 * *is* this occasion - not merely which fell on the same date. The two
 * differ constantly in the catalog: several farbrengens share one date
 * (ערב יו"כ, ברכת הבנים next to ערב יו"כ, אחרי מנחה), the same holiday
 * farbrengen lands on the eve one year and the day itself the next, the
 * second day of a Yom Tov is keyed a day after its own night, and a
 * Shabbos parsha's date wanders across a whole week between years.
 *
 * So an occasion's identity is read off its label, mafteiach.app's own
 * short Hebrew description, split into the parts that recur year to year:
 *
 * - `strong`: the tokens that name the occasion - a holiday abbreviation
 *   (יו"כ, חה"ש, חנוכה), a parsha (בראשית), a distinctive detail (הבנים
 *   from ברכת הבנים). Day-of-holiday prefixes are stripped (דחה"ש ->
 *   חה"ש), and words that describe every farbrengen alike (התוועדות,
 *   שיחה, אחרי מנחה...) are left out.
 * - `dateTokens`: gematria day numbers and month names. A label that is
 *   nothing but a date (י"ט כסלו, כ"ח סיון) has no strong tokens, and its
 *   identity *is* its date.
 * - `ordinals`: א', ב'... - which day of a holiday (ליל ב' דחה"ש).
 * - `timeOfDay`: ערב / ליל / יום / מוצאי, when the label leads with one.
 *
 * Matching is then a score: shared strong tokens weigh most, a matching
 * ordinal next (the second night and the second day of a Yom Tov are the
 * same occasion even though their dates differ by one), then the same
 * time of day, then date proximity as the tie-breaker. Nothing here
 * needs to be perfect - a label that this cannot read just falls back to
 * matching by date, which is where the screen started.
 */

export type TimeOfDay = 'eve' | 'night' | 'day' | 'after';

export interface OccasionIdentity {
  strong: string[];
  dateTokens: string[];
  ordinals: string[];
  timeOfDay: TimeOfDay | null;
}

const TIME_WORDS: Record<string, TimeOfDay> = {
  'ערב': 'eve',
  'בערב': 'eve',
  'עש"ק': 'eve',
  'ליל': 'night',
  'לילה': 'night',
  'בליל': 'night',
  'יום': 'day',
  'ביום': 'day',
  'מוצאי': 'after',
  'מוצש"ק': 'after',
  'מוצש"פ': 'after',
  'מוצאי-שבת': 'after',
};

/** ערב + holiday, written as one token: עחה"ש (ערב חג השבועות), עיו"כ, ער"ה... */
const EVE_PREFIXED = /^ע(חה"ש|חה"פ|יו"כ|יוה"כ|ר"ה|פסח|סוכות|שבועות|שמח"ת|חנוכה|פורים|שבת)$/;
/** "of the holiday" prefix: דחה"ש (של חג השבועות), דחנוכה, דר"ה... never a plain word that happens to start with ד (דברים). */
const OF_PREFIXED = /^ד(חה"ש|חה"פ|חנוכה|ר"ה|סוכות|שבועות|פסח|פורים|חוה"מ|חוהמ"ס|חוהמ"פ|חג|שמח"ת|שמע"צ|יו"ט|סליחות|חנוכה)$/;

const MONTH_NAMES = new Set([
  'תשרי', 'חשון', 'חשוון', 'מרחשון', 'מר-חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אד"ר', 'אד"ש', 'ניסן', 'אייר', 'סיון', 'סיוון', 'תמוז', 'אב', 'מנ"א', 'אלול',
  'תשרי.', 'ראשון', 'שני',
]);

/** Words that describe the circumstances of a farbrengen, not which one it is. */
const STOP_WORDS = new Set([
  'לפנות', 'בוקר', 'אחרי', 'לאחר', 'אחר', 'לפני', 'מנחה', 'מעריב', 'שחרית', 'מוסף', 'חצות', 'בעת', 'הסעודה', 'סעודה', 'סעודת', 'בסעודה',
  'שיחה', 'שיחות', 'שיחת', 'ברכה', 'ברכת', 'ברכות', "להת'", 'להתלמידים', 'לתלמידים', 'התלמידים', 'התמימים', "שי'", 'הנוסעים', 'בשליחות',
  'בקבלת', 'קבלת', 'פנים', 'מסירת', 'דמי', 'של', 'על', 'עם', 'אל', 'את', 'כל', 'שבת', 'ש"ק', 'ש"פ', "פ'", 'פרשת', 'התוועדות', "הת'",
  'נר', 'ימים', 'המשך', 'בבית', 'הכנסת', 'ביחידות', 'לילדים', 'לנשים', 'לאורחים', 'לאנ"ש', 'אנ"ש', 'הרבנים', 'לרבנים', 'בחדרו', 'הק\'', 'קודש',
  'ואחרי', 'ולאחרי', 'ולפני', 'בסיום', 'סיום', 'התחלת', 'תחילת', 'קודם', 'בתחילת', 'שעה', 'בשעה', 'בערך',
]);

/** A single Hebrew letter with a geresh (א', ב', ה'), the day-ordinal shape. */
const ORDINAL = /^[א-ת]'$/;
/** Gematria numbers: כ', י"ט, ט"ו, כ"ח - one letter, or two joined by gershayim. */
const GEMATRIA = /^[א-ת](?:"[א-ת])?'?$/;
/** Abbreviations that look like gematria but name an occasion. */
const NOT_GEMATRIA = new Set(['ר"ה', 'ש"ק', 'ש"פ', 'ח"י', 'ל"ג']);

const identityCache = new Map<string, OccasionIdentity>();

function normalizeToken(raw: string): string {
  return raw.replace(/[״“”]/g, '"').replace(/[׳’]/g, "'").replace(/^[.\-()]+|[.\-():;]+$/g, '');
}

export function occasionIdentity(label: string): OccasionIdentity {
  const cached = identityCache.get(label);
  if (cached) return cached;

  const strong: string[] = [];
  const dateTokens: string[] = [];
  const ordinals: string[] = [];
  let timeOfDay: TimeOfDay | null = null;

  for (const rawToken of label.split(/[\s,;:()\-–]+/)) {
    let token = normalizeToken(rawToken);
    if (!token) continue;

    const time = TIME_WORDS[token];
    if (time) {
      if (!timeOfDay) timeOfDay = time;
      continue;
    }
    const eve = EVE_PREFIXED.exec(token);
    if (eve) {
      if (!timeOfDay) timeOfDay = 'eve';
      token = eve[1]!;
    }
    const of = OF_PREFIXED.exec(token);
    if (of) token = of[1]!;

    if (ORDINAL.test(token)) {
      ordinals.push(token);
      dateTokens.push(token);
      continue;
    }
    if (MONTH_NAMES.has(token)) {
      dateTokens.push(token);
      continue;
    }
    if (GEMATRIA.test(token) && !NOT_GEMATRIA.has(token)) {
      dateTokens.push(token);
      continue;
    }
    if (STOP_WORDS.has(token) || token.length < 2) continue;
    if (!strong.includes(token)) strong.push(token);
  }

  const identity = { strong, dateTokens, ordinals, timeOfDay };
  identityCache.set(label, identity);
  return identity;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * How strongly `candidate` reads as the same occasion as `source`, given
 * how many days apart they fall in their own years - `null` when it is
 * not the same occasion at all (nothing in common beyond, at most, the
 * calendar). Higher is better; see the module comment for the weights.
 */
export function scoreOccasionMatch(source: OccasionIdentity, candidate: OccasionIdentity, dayDistance: number): number | null {
  const overlap = source.strong.filter((token) => candidate.strong.includes(token)).length;
  if (source.strong.length > 0 || candidate.strong.length > 0) {
    if (overlap === 0) return null;
  } else if (dayDistance !== 0 && !sameSet(source.dateTokens, candidate.dateTokens)) {
    return null;
  }

  let score = 3 * overlap;
  if (source.ordinals.length > 0 && candidate.ordinals.length > 0) score += sameSet(source.ordinals, candidate.ordinals) ? 3 : -1;
  if (source.timeOfDay && candidate.timeOfDay) score += source.timeOfDay === candidate.timeOfDay ? 1 : -1;
  score += dayDistance === 0 ? 2 : dayDistance <= 1 ? 1 : dayDistance <= 7 ? 0 : -2;
  return score;
}

export interface YearOccasionMatches {
  hebrewYear: number;
  /** The occasion(s) in this year read as the same occasion as the source, best first - the source entry itself in its own year. */
  matches: CatalogEntry[];
  /** Everything else with content on the source's date in this year - a different farbrengen that happened to share the date. */
  others: CatalogEntry[];
}

/** Beyond this many days from the source date, an entry is only a candidate when its label shares a strong token. */
const NEAR_WINDOW_DAYS = 7;
/** A label match this far from the source date is not the same occasion (a parsha never drifts more than a couple of weeks). */
const FAR_LIMIT_DAYS = 21;

function entryHDate(entry: CatalogEntry, year: number): HDate | null {
  const day = mafteiachDay(entry.hebrewDate);
  if (day < 1 || day > 30) return null;
  let month: number;
  try {
    month = mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(entry.hebrewDate));
  } catch {
    return null;
  }
  if (month === 13 && !HDate.isLeapYear(year)) month = 12;
  return new HDate(day, month, year);
}

/**
 * The source occasion's own date carried into `year` - same month and
 * day, with a leap year's Adar II folding into plain Adar when `year` has
 * no second Adar (the same rule `toMafteiachHebrewDateKey` applies).
 */
function sourceDateIn(source: CatalogEntry, year: number): HDate | null {
  return entryHDate(source, year);
}

/**
 * Every year's own occurrence of `source` (see the module comment for what
 * "same occasion" means), plus whatever else that year has on the same
 * date - grouped by year, earliest first, years with neither omitted. The
 * source's own year is included, with the source itself as its match.
 */
export function resolveOccasionAllYears(catalog: CatalogByYear, source: CatalogEntry): YearOccasionMatches[] {
  const sourceIdentity = occasionIdentity(source.occasionLabel);
  const years = Object.keys(catalog)
    .map(Number)
    .sort((a, b) => a - b);

  const results: YearOccasionMatches[] = [];
  for (const year of years) {
    const anchor = sourceDateIn(source, year);
    if (!anchor) continue;
    const anchorAbs = anchor.abs();

    let best = -Infinity;
    let matches: CatalogEntry[] = [];
    const sameDate: CatalogEntry[] = [];
    for (const entry of catalog[year] ?? []) {
      if (!entryHasContent(entry)) continue;
      const date = entryHDate(entry, year);
      if (!date) continue;
      const distance = Math.abs(date.abs() - anchorAbs);
      if (distance === 0) sameDate.push(entry);
      if (entry === source) {
        best = Infinity;
        matches = [entry];
        continue;
      }
      if (best === Infinity) continue;
      if (distance > FAR_LIMIT_DAYS) continue;
      const identity = occasionIdentity(entry.occasionLabel);
      if (distance > NEAR_WINDOW_DAYS && !sourceIdentity.strong.some((token) => identity.strong.includes(token))) continue;
      const score = scoreOccasionMatch(sourceIdentity, identity, distance);
      if (score == null) continue;
      if (score > best) {
        best = score;
        matches = [entry];
      } else if (score === best) {
        matches.push(entry);
      }
    }

    const others = sameDate.filter((entry) => !matches.includes(entry));
    if (matches.length > 0 || others.length > 0) results.push({ hebrewYear: year, matches, others });
  }
  return results;
}
