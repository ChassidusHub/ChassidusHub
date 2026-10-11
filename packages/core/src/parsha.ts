import { HDate, Locale, getSedra, months, parshiot } from '@hebcal/core';
import { dateKeyFromHDate, normalizeSearchText, unfinal } from '@chassidushub/hebrew';

/**
 * A parsha in a search ("תצוה", "פרשת בשלח", "Beshalach", even "Beshalah"):
 * taken only when it is all the words, so a maamar's opening words that
 * end in a parsha's name ("ואתה תצוה") stay words (#90). A parsha found
 * is the farbrengens of its weeks, in the year the query gives or in all
 * the years farbrengens are indexed for.
 */

/** The years farbrengens are indexed for, as the old site and the app keep them. */
export const FIRST_YEAR = 5710;
export const LAST_YEAR = 5752;

const norm = (s: string) => unfinal(normalizeSearchText(s));

/** Words said before a parsha's name that are not part of it. */
const PREFIXES = new Set(['פרשת', 'פרשה', 'parshas', 'parshat', 'parsha', 'parashat', 'שבת', 'shabbos']);

/** Each spelling of each parsha (hebcal's, Hebrew without nikud, hyphens as spaces), normalized as a search is. */
const SPELLINGS = new Map<string, string>();
for (const name of parshiot) {
  for (const form of [name, Locale.gettext(name, 'he-x-NoNikud'), name.replace(/-/g, ' ')]) SPELLINGS.set(norm(form), name);
}

/** Edit distance, for a mistyped parsha. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** The one parsha a mistyped word is closest to, within a third of its letters; none if two are as close. */
function nearest(word: string): string | null {
  if (word.length < 4) return null;
  const budget = Math.floor(word.length * 0.34);
  let best: { name: string; d: number } | null = null;
  let tie = false;
  for (const [spelling, name] of SPELLINGS) {
    if (spelling.includes(' ')) continue;
    const d = distance(word, spelling);
    if (d > budget) continue;
    if (!best || d < best.d) {
      best = { name, d };
      tie = false;
    } else if (d === best.d && name !== best.name) tie = true;
  }
  return best && !tie ? best.name : null;
}

/** The parsha the words are, when they are nothing else: hebcal's name (`Tetzaveh`), else null. */
export function parshaOf(words: string): string | null {
  const tokens = norm(words).split(' ').filter((w) => w && !PREFIXES.has(w));
  if (tokens.length === 0) return null;
  const exact = SPELLINGS.get(tokens.join(' '));
  if (exact) return exact;
  // Two parshiyos read together ("ויקהל פקודי", "Vayakhel-Pekudei"): the first, whose weeks include the joined ones.
  for (let at = 1; at < tokens.length; at++) {
    const first = SPELLINGS.get(tokens.slice(0, at).join(' '));
    if (first && SPELLINGS.has(tokens.slice(at).join(' '))) return first;
  }
  return tokens.length === 1 ? nearest(tokens[0]!) : null;
}

/** A parsha's name in Hebrew, as the site shows it. */
export const parshaHe = (name: string) => Locale.gettext(name, 'he-x-NoNikud');

/** The days (Sunday to Shabbos) of the week whose Shabbos reads `parsha` in `year`; a joined parsha counts for both. */
export function parshaWeek(parsha: string, year: number): string[] {
  const sedra = getSedra(year, false);
  const end = new HDate(1, months.TISHREI, year + 1);
  for (let d = new HDate(1, months.TISHREI, year).onOrAfter(6); d.deltaDays(end) < 0; d = d.add(7, 'd')) {
    const found = sedra.lookup(d);
    if (found.chag || !found.parsha.includes(parsha)) continue;
    const days: string[] = [];
    for (let x = d.onOrBefore(0); x.deltaDays(d) <= 0; x = x.next()) days.push(dateKeyFromHDate(x));
    return days;
  }
  return [];
}

/** The days of a parsha's weeks: in one year, or in every year farbrengens are indexed for. */
export function parshaDays(parsha: string, year: number | null): string[] {
  const years = year ? [year] : Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  return years.flatMap((y) => parshaWeek(parsha, y));
}
