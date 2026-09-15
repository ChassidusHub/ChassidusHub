import { Locale, gematriyaStrToNum, parshiot } from '@hebcal/core';
import { CHAG_CATEGORIES, MAFTEIACH_MONTH_OPTIONS } from '@sichos-kodesh/catalog';
import { normalize } from './searchOccasions';

export interface DetectedFilters {
  hebrewYear: number | null;
  hdateMonth: number | null;
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

/** Removes the first whole-word occurrence of `phrase` from `text`, or returns `null` if it isn't present as a whole word. */
function removePhrase(text: string, phrase: string): string | null {
  const idx = text.indexOf(phrase);
  if (idx === -1) return null;
  if (isWordChar(text[idx - 1]) || isWordChar(text[idx + phrase.length])) return null;
  return `${text.slice(0, idx)} ${text.slice(idx + phrase.length)}`.replace(/\s+/g, ' ').trim();
}

/** Every quote/apostrophe-like character a Hebrew year's geresh/gershayim might actually be typed as - the same set `normalize()` strips, which is exactly why this check has to run on the *raw* query, before that stripping happens (see parseSmartQuery). */
const GERESH_MARKS = /["'‘’“”״׳`´]/;

/**
 * Every real year in this catalog, written without its thousands digit
 * (`5735` -> `תשלה`), lands on 2-4 Hebrew letters - real users very often
 * type it exactly that way, with no geresh/gershayim at all (a confirmed
 * report: `חי אלול תשלה` found nothing, because `תשלה` alone was never
 * even tried against gematria without a quote mark present). A bare
 * all-Hebrew-letters token up to 6 letters is accepted too, not just a
 * geresh-marked one - the caller's own range check (against this
 * catalog's *real*, fairly narrow year span) is what actually guards
 * against an ordinary word coincidentally summing to an in-range value,
 * not the presence of a quote mark.
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
 * Pulls year/month/parsha/chag signals out of a free-text search query, so
 * typing e.g. `בשלח תשל"ו` or "Kislev Sukkot" finds the right occasions
 * without ever touching the dropdown filters - a real, requested gap
 * (those filters previously only ever came from picking a `<select>`
 * option, word order and all). Detected phrases are removed from the
 * returned `remainingText`; whatever's left over is still free text for
 * Fuse.js's own fuzzy label search. Only a whole-catalog-valid year (the
 * caller's `yearRange`, from the real bundled catalog) is ever reported - a
 * coincidentally in-range-looking number that isn't a real catalog year
 * doesn't help anyone and would just quietly return zero results.
 *
 * Year detection runs on the *raw* query first, one whitespace-split token
 * at a time - it has to happen before `normalize()` runs (which strips
 * every quote-like character, geresh/gershayim included, for the phrase
 * matching below) or a gematriya year could never be told apart from an
 * ordinary word missing its geresh entirely.
 */
export function parseSmartQuery(query: string, yearRange: { min: number; max: number }): SmartQueryResult {
  const nonYearRawTokens: string[] = [];
  const detected: DetectedFilters = { hebrewYear: null, hdateMonth: null, parsha: null };

  for (const rawToken of query.split(/\s+/)) {
    if (!rawToken) continue;
    let year: number | null = null;
    if (/^\d{4}$/.test(rawToken)) {
      const asNumber = Number(rawToken);
      if (asNumber >= yearRange.min && asNumber <= yearRange.max) year = asNumber;
    } else {
      const fromGematriya = gematriyaYear(rawToken);
      if (fromGematriya !== null && fromGematriya >= yearRange.min && fromGematriya <= yearRange.max) year = fromGematriya;
    }
    if (year !== null) {
      detected.hebrewYear = year;
    } else {
      nonYearRawTokens.push(rawToken);
    }
  }

  let text = normalize(nonYearRawTokens.join(' '));
  for (const phrase of getPhraseFilters()) {
    const next = removePhrase(text, phrase.normalized);
    if (next === null) continue;
    phrase.apply(detected);
    text = next;
  }

  return { detected, remainingText: text };
}
