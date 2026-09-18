import { Locale, gematriyaStrToNum, parshiot } from '@hebcal/core';
import { CHAG_CATEGORIES, MAFTEIACH_MONTH_OPTIONS } from '@sichos-kodesh/catalog';
import { normalize } from './searchOccasions.js';

export interface DetectedFilters {
  hebrewYear: number | null;
  hdateMonth: number | null;
  /** Hebrew day-of-month (1-30) - see `gematriyaDay`'s own comment for what forms are recognized. */
  day: number | null;
  /** A `parshiot` entry or a `ChagCategory` - same "one field" convention `SearchFilters.parsha` already uses. */
  parsha: string | null;
}

export interface SmartQueryResult {
  detected: DetectedFilters;
  /** What's left of the query after every detected phrase/year is removed - what Fuse.js should still fuzzy-match against occasion labels. Empty once the whole query was consumed by detected filters. */
  remainingText: string;
}

/** hebcal's own locale data has no entry for these two - see parshaOptions.ts's own copy of this same table. */
const CHOL_HAMOED_HEBREW: Partial<Record<string, string>> = {
  'Chol HaMoed Sukkot': 'חול המועד סוכות',
  'Chol HaMoed Pesach': 'חול המועד פסח',
};

interface PhraseFilter {
  normalized: string;
  apply: (detected: DetectedFilters) => void;
}

function buildPhraseFilters(): PhraseFilter[] {
  const phrases: PhraseFilter[] = [];
  for (const month of MAFTEIACH_MONTH_OPTIONS) {
    phrases.push({ normalized: normalize(month.name), apply: (d) => (d.hdateMonth = month.hdateMonth) });
    phrases.push({ normalized: normalize(month.nameHebrew), apply: (d) => (d.hdateMonth = month.hdateMonth) });
  }
  for (const name of parshiot) {
    phrases.push({ normalized: normalize(name), apply: (d) => (d.parsha = name) });
    phrases.push({ normalized: normalize(Locale.gettext(name, 'he-x-NoNikud')), apply: (d) => (d.parsha = name) });
  }
  for (const name of CHAG_CATEGORIES) {
    phrases.push({ normalized: normalize(name), apply: (d) => (d.parsha = name) });
    phrases.push({ normalized: normalize(CHOL_HAMOED_HEBREW[name] ?? Locale.gettext(name, 'he-x-NoNikud')), apply: (d) => (d.parsha = name) });
  }
  // Longest phrases first, so a multi-word chag ("Chol HaMoed Sukkot") is
  // consumed whole before its own shorter substring ("Sukkot") would
  // otherwise get a separate, wrong match out of what's left behind.
  return phrases.filter((p) => p.normalized.length > 0).sort((a, b) => b.normalized.length - a.normalized.length);
}

let cachedPhraseFilters: PhraseFilter[] | null = null;
function getPhraseFilters(): PhraseFilter[] {
  if (!cachedPhraseFilters) cachedPhraseFilters = buildPhraseFilters();
  return cachedPhraseFilters;
}

/** True at a text boundary - start/end of string, or a non letter/digit neighbor - so matching "שבט" doesn't also fire inside some unrelated longer word that merely contains those same letters in sequence. */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** Standard edit distance (insertions, deletions, substitutions) - only ever run here on a single short word against a single short phrase, so the plain O(n·m) table is more than fast enough. */
function levenshtein(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = a[i - 1] === b[j - 1] ? rows[i - 1]![j - 1]! : 1 + Math.min(rows[i - 1]![j]!, rows[i]![j - 1]!, rows[i - 1]![j - 1]!);
    }
  }
  return rows[a.length]![b.length]!;
}

/** How many wrong letters a single-word phrase match tolerates, scaled to the phrase's own length - one wrong letter in a 3-5 letter month/parsha name (e.g. "שבת" typed for "שבט", a real, common ת/ט mix-up), but none at all for a 1-2 letter phrase, where a single edit is too large a fraction of the word to trust without risking an unrelated short word matching by coincidence. */
function fuzzyBudget(phraseLength: number): number {
  return Math.floor(phraseLength * 0.34);
}

/** Removes the first whole-word occurrence of `phrase` from `text` if present exactly, or returns `null`. */
function removeExactPhrase(text: string, phrase: string): string | null {
  const idx = text.indexOf(phrase);
  if (idx === -1) return null;
  if (isWordChar(text[idx - 1]) || isWordChar(text[idx + phrase.length])) return null;
  return `${text.slice(0, idx)} ${text.slice(idx + phrase.length)}`.replace(/\s+/g, ' ').trim();
}

/**
 * The single closest single-word phrase to `word` among `phrases`, if
 * exactly one is within its own `fuzzyBudget` - not just the first one
 * that happens to clear the threshold. Two real month names can be one
 * edit apart from each other too (e.g. "טבת"/Tevet and "שבט"/Shevat are
 * both one substitution away from the typo "שבת"), so picking whichever
 * phrase is checked first, rather than whichever is actually closest,
 * would let list order silently decide between two different, equally-
 * plausible corrections. A genuine tie for closest is treated the same as
 * no match at all: confidently guessing wrong between two real months
 * would show the wrong occasion's content outright, which is worse than
 * leaving the word for Fuse's own (much less confident, but not silently
 * wrong) free-text fallback.
 */
/** Whether two phrase filters would set the exact same detected value - the English and Hebrew names of one month aren't a real ambiguity even if both happen to fuzzy-match at the same distance, only two phrases that disagree are. */
function sameEffect(a: PhraseFilter, b: PhraseFilter): boolean {
  const empty = (): DetectedFilters => ({ hebrewYear: null, hdateMonth: null, day: null, parsha: null });
  const da = empty();
  const db = empty();
  a.apply(da);
  b.apply(db);
  return da.hdateMonth === db.hdateMonth && da.parsha === db.parsha;
}

function bestFuzzyPhrase(word: string, phrases: PhraseFilter[]): PhraseFilter | null {
  let best: PhraseFilter | null = null;
  let bestDistance = Infinity;
  let tied = false;
  for (const phrase of phrases) {
    if (phrase.normalized.includes(' ')) continue; // Multi-word phrases stay exact-only.
    const budget = fuzzyBudget(phrase.normalized.length);
    if (budget === 0 || Math.abs(word.length - phrase.normalized.length) > budget) continue;
    const distance = levenshtein(word, phrase.normalized);
    if (distance > budget) continue;
    if (distance < bestDistance) {
      best = phrase;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance && best && !sameEffect(phrase, best)) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** Every quote/apostrophe-like character a Hebrew year's geresh/gershayim might actually be typed as - the same set `normalize()` strips, which is exactly why this check has to run on the *raw* query, before that stripping happens (see parseSmartQuery). */
const GERESH_MARKS = /["'‘’“”״׳`´]/;
const GERESH_MARKS_GLOBAL = /["'‘’“”״׳`´]/g;

/**
 * Every real year in this catalog, written without its thousands digit
 * (`5735` -> `תשלה`), lands on 2-4 Hebrew letters, and users often type it
 * that way with no geresh/gershayim at all. A bare all-Hebrew-letters
 * token up to 6 letters is accepted too, not just a geresh-marked one -
 * the caller's own range check (against this catalog's real, fairly
 * narrow year span) is what actually guards against an ordinary word
 * coincidentally summing to an in-range value, not the presence of a
 * quote mark.
 */
const HEBREW_LETTERS_ONLY = /^[א-ת]{1,6}$/;

/**
 * A raw (pre-normalize) token written as a Hebrew year - e.g. `תשל"ו` or
 * plain `תשלו` (5736) - parsed via `gematriyaStrToNum`, which only sums
 * the Hebrew letters and ignores everything else (a quote mark included),
 * so it doesn't matter which exact quote character was typed, or whether
 * one was typed at all.
 */
function gematriyaYear(rawToken: string): number | null {
  if (!GERESH_MARKS.test(rawToken) && !HEBREW_LETTERS_ONLY.test(rawToken)) return null;
  const raw = gematriyaStrToNum(rawToken);
  if (raw <= 0) return null;
  return raw < 1000 ? raw + 5000 : raw;
}

/**
 * A year abbreviated further still, dropping the recurring "תש" (700)
 * prefix along with the millennium digit - e.g. `ל"ו`/`לו` for `תשל"ו`
 * (5736) - a common further shorthand once a year's hundreds digit hasn't
 * changed in living memory (every real catalog year is in the 5700s).
 * Unlike `gematriyaYear` above, this is *only* tried adjacent to a
 * recognized month/parsha/chag (see `isAdjacentToMonthOrParsha`): its
 * numeric range overlaps almost entirely with ordinary day-of-month values
 * and plenty of ordinary short words (e.g. "חב"ד" sums to 14, landing on
 * the very real catalog year 5714) - safe only in a full date's own
 * context, never as a standalone guess the way a longer, less
 * word-like spelled-out year already safely is.
 */
function abbreviatedYear(rawToken: string): number | null {
  if (!GERESH_MARKS.test(rawToken) && !HEBREW_LETTERS_ONLY.test(rawToken)) return null;
  const raw = gematriyaStrToNum(rawToken);
  return raw > 0 && raw < 1000 ? raw + 5700 : null;
}

/** Compact Hebrew day-of-month numerals (1-30) never run past 2 letters - the largest, 29, is כ"ט (כ+ט). Unmarked (no geresh/gershayim), this is only ever trusted as a day when it sits directly next to a recognized month/parsha/chag name - see `isAdjacentToMonthOrParsha`'s own comment - since on its own a bare 1-2 letter token is far too likely to just be an ordinary short Hebrew word (e.g. "של", "אל", "עם") for a bare gematria sum to be a safe signal by itself. */
const HEBREW_DAY_LETTERS = /^[א-ת]{1,2}$/;

/** Written-out day names that don't sum to their own value via plain gematria - e.g. `gematriyaStrToNum('יוד')` sums to 20 (י+ו+ד), not 10, because this is the spelled-out *name* of the letter yud, not a compact numeral. Chabad's own significant dates are conventionally named this way (Yud Shevat, Yud-Beis Tammuz, Gimmel Tammuz) rather than with the compact form, in both Hebrew and its common English transliteration - "Chai Elul" isn't in this table because "חי" (chai) already sums correctly to 18 on its own (see `isAdjacentToMonthOrParsha` for how a bare, unmarked word like this one is still told apart from an ordinary short word). */
const SPELLED_DAY_ALIASES: Record<string, number> = { יוד: 10, yud: 10, גימל: 3, gimmel: 3 };

/**
 * Whether the raw token immediately before or after `index` (in `rawTokens`)
 * is an exact match (once normalized) for a single-word month, parsha, or
 * chag name - the signal that makes an otherwise-too-risky bare, unmarked
 * short numeral (see `HEBREW_DAY_LETTERS`) safe to read as that month's day
 * instead. "<day> <month> <year>" (in either script) is the standard way
 * Hebrew dates get written and searched, so a short word sitting right next
 * to a real month name is overwhelmingly more likely to be that day than a
 * coincidental short word that happens to also be a month's neighbor -
 * unlike a same-shaped word appearing anywhere else in a free-text query,
 * which stays too ambiguous to guess at (hence the mark requirement
 * everywhere else). Deliberately exact-match only, not fuzzy - stacking a
 * fuzzy month guess on top of an already-unmarked day guess would compound
 * uncertainty rather than resolve it.
 */
function isAdjacentToMonthOrParsha(rawTokens: string[], index: number): boolean {
  const phrases = getPhraseFilters();
  const isMonthOrParsha = (token: string | undefined): boolean => {
    if (!token) return false;
    const norm = normalize(token);
    return norm.length > 0 && phrases.some((p) => p.normalized === norm);
  };
  return isMonthOrParsha(rawTokens[index - 1]) || isMonthOrParsha(rawTokens[index + 1]);
}

/**
 * A raw token written as a Hebrew day-of-month - either a compact numeral
 * with an explicit geresh/gershayim (`י'` for 10, `כ"ד` for 24) or one of
 * `SPELLED_DAY_ALIASES`' written-out names, which need no mark since
 * they're unambiguous words in their own right. Returns `null` for
 * anything else, including a bare unmarked compact numeral - see
 * `HEBREW_DAY_LETTERS`'s own comment for why that's deliberately excluded.
 */
function gematriyaDay(rawToken: string): number | null {
  const lower = rawToken.toLowerCase();
  if (SPELLED_DAY_ALIASES[lower] != null) return SPELLED_DAY_ALIASES[lower];
  if (!GERESH_MARKS.test(rawToken)) return null;
  const stripped = rawToken.replace(GERESH_MARKS_GLOBAL, '');
  if (!HEBREW_DAY_LETTERS.test(stripped)) return null;
  const day = gematriyaStrToNum(rawToken);
  return day >= 1 && day <= 30 ? day : null;
}

/**
 * Pulls year/month/day/parsha/chag signals out of a free-text search
 * query, so typing e.g. `בשלח תשל"ו` or "10 Kislev" finds the right
 * occasions without ever touching the dropdown filters. Detected phrases
 * are removed from the returned `remainingText`; whatever's left over is
 * still free text for Fuse.js's own fuzzy label search. Only a
 * whole-catalog-valid year (the caller's `yearRange`, from the bundled
 * catalog) is ever reported - a coincidentally in-range-looking number
 * that isn't a real catalog year doesn't help anyone and would just
 * quietly return zero results.
 *
 * A day, once detected, is reported as a real structured filter rather
 * than left in `remainingText` for Fuse - relying on fuzzy label matching
 * for something this exact would only work when a given occasion's own
 * label happens to spell the day the same way the query did, which varies
 * year to year (one year's "יו"ד שבט" fuzzy-matches a query typed "יוד"
 * fine; a differently-worded year's label might not), and Fuse's own
 * minimum match length silently drops a single-letter query like "י'"
 * altogether.
 *
 * Year and day detection both run on the *raw* query first, one
 * whitespace-split token at a time, with lookahead/lookbehind to each
 * token's immediate neighbor (see `isAdjacentToMonthOrParsha`) - it has to
 * happen before `normalize()` runs (which strips every quote-like
 * character, geresh/gershayim included, for the phrase matching below) or
 * a gematriya year/day could never be told apart from an ordinary word
 * missing its geresh entirely.
 */
export function parseSmartQuery(query: string, yearRange: { min: number; max: number }): SmartQueryResult {
  const rawTokens = query.split(/\s+/).filter(Boolean);
  const remainingRawTokens: string[] = [];
  const detected: DetectedFilters = { hebrewYear: null, hdateMonth: null, day: null, parsha: null };

  for (let i = 0; i < rawTokens.length; i++) {
    const rawToken = rawTokens[i]!;

    // A bare 1-2 digit ASCII number is unambiguous as a day (there's no
    // other structured field it could mean).
    if (detected.day == null && /^([1-9]|[12]\d|30)$/.test(rawToken)) {
      detected.day = Number(rawToken);
      continue;
    }
    // A geresh-marked compact numeral or spelled alias (יוד, גימל, ...) is
    // also unambiguous as a day in its own right, regardless of context -
    // checked before the year guess below because the exact same gematria
    // sum can otherwise also pass as a plausible dropped-prefix year (e.g.
    // ח"י = 18, which is both Chai Elul's day *and*, read as a year
    // fragment, the real catalog year 5718) - a query author who actually
    // marked a token as a day gets that reading, full stop.
    if (detected.day == null) {
      const markedDay = gematriyaDay(rawToken);
      if (markedDay !== null) {
        detected.day = markedDay;
        continue;
      }
    }
    // An unmarked (bare) short numeral is only trusted as a day when it
    // sits directly next to a recognized month/parsha/chag name - see
    // isAdjacentToMonthOrParsha's own comment. "<day> <month> <year>" is
    // the standard word order for a Hebrew date, so e.g. in "י שבט לו",
    // "י" (10) is the day even though, read in isolation, it would also
    // pass the bare-word year check below.
    if (detected.day == null && HEBREW_DAY_LETTERS.test(rawToken) && isAdjacentToMonthOrParsha(rawTokens, i)) {
      const bareDay = gematriyaStrToNum(rawToken);
      if (bareDay >= 1 && bareDay <= 30) {
        detected.day = bareDay;
        continue;
      }
    }

    if (/^\d{4}$/.test(rawToken)) {
      const asNumber = Number(rawToken);
      if (asNumber >= yearRange.min && asNumber <= yearRange.max) {
        detected.hebrewYear = asNumber;
        continue;
      }
    } else {
      const year = gematriyaYear(rawToken);
      if (year !== null && year >= yearRange.min && year <= yearRange.max) {
        detected.hebrewYear = year;
        continue;
      }
      // Only tried once the fuller form above doesn't already resolve,
      // and only adjacent to a recognized month/parsha - see
      // abbreviatedYear's own comment on why that context is required.
      if (isAdjacentToMonthOrParsha(rawTokens, i)) {
        const shortYear = abbreviatedYear(rawToken);
        if (shortYear !== null && shortYear >= yearRange.min && shortYear <= yearRange.max) {
          detected.hebrewYear = shortYear;
          continue;
        }
      }
    }

    remainingRawTokens.push(rawToken);
  }

  let text = normalize(remainingRawTokens.join(' '));
  for (const phrase of getPhraseFilters()) {
    const next = removeExactPhrase(text, phrase.normalized);
    if (next === null) continue;
    phrase.apply(detected);
    text = next;
  }

  // One pass, after every exact match is already applied, picking each
  // remaining word's single best fuzzy phrase match (if any) rather than
  // trying phrases one at a time against the whole text - see
  // bestFuzzyPhrase's own comment on why that matters.
  const phrases = getPhraseFilters();
  const keptWords: string[] = [];
  for (const word of text.split(' ')) {
    if (!word) continue;
    const match = bestFuzzyPhrase(word, phrases);
    if (match) match.apply(detected);
    else keptWords.push(word);
  }
  text = keptWords.join(' ');

  return { detected, remainingText: text };
}
