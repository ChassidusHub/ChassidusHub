/**
 * How a HebrewBooks title splits into a series and a volume. The catalog
 * writes a volume several ways, and each is handled here:
 * - after a dash: `לקוטי שיחות - א (בראשית - שמות - ויקרא)`;
 * - as a year: `ספר המאמרים תרנ"ט`;
 * - after a closing bracket: `אגרות קודש (אדמו"ר מוהרש"ב) ג`;
 * - after a marker: `... חלק ב`, `... ח"א`, `... כרך ג`.
 * The rest of a title is its series, so one sefer's volumes come together
 * and a single book is a series of one.
 */

/** Hebrew quotes in place of the ASCII ones the catalog mixes in (`''` and `"` to ״, `'` and `’` to ׳), spaces collapsed. */
export function hebrewQuotes(text: string): string {
  return text
    .replace(/''|"/g, '״')
    .replace(/['’`]/g, '׳')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A series title reduced for matching: no quotes or brackets' spacing, and the common spelling variants made one. */
export function seriesKey(title: string): string {
  return hebrewQuotes(title)
    .replace(/[״׳]/g, '')
    .replace(/ליקוטי/g, 'לקוטי')
    .replace(/שולחן/g, 'שלחן')
    .replace(/מצוותיך/g, 'מצותיך')
    .replace(/\s*([()])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// A year as the catalog prints it: תש״ג, ה׳תשמ״ה, תרנ״ט, and ranges of them (תש״ג-תש״ד).
const YEAR = String.raw`(?:ה׳)?[תשר][א-ת]{0,3}״[א-ת]`;
const YEARS = new RegExp(`^${YEAR}(?:[-–]${YEAR})*$`);
const MARKER = /^(?:חלק|כרך)$/;
const NUMERAL = /^[א-ת]{1,2}״?[א-ת]?$/;

/** The index of the first ` - ` (or en/em dash) outside brackets, or -1. */
function topLevelDash(title: string): number {
  let depth = 0;
  for (let i = 0; i < title.length; i += 1) {
    const char = title[i]!;
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === '-' || char === '–' || char === '—') && title[i - 1] === ' ' && title[i + 1] === ' ') return i;
  }
  return -1;
}

/** Moves a trailing volume (a year, `חלק ב`, `ח״א`, a numeral after a bracket) off the end of a series title. */
function trailingVolume(series: string): { series: string; volume: string | null } {
  const words = series.split(' ');
  const taken: string[] = [];
  for (;;) {
    const last = words[words.length - 1];
    if (!last || words.length < 2) break;
    if (YEARS.test(last) || /^ח״[א-ת]$/.test(last)) {
      taken.unshift(words.pop()!);
      continue;
    }
    const before = words[words.length - 2]!;
    if (NUMERAL.test(last) && MARKER.test(before) && words.length > 2) {
      taken.unshift(words.pop()!);
      taken.unshift(words.pop()!);
      continue;
    }
    if (NUMERAL.test(last) && before.endsWith(')')) {
      taken.unshift(words.pop()!);
      continue;
    }
    break;
  }
  return { series: words.join(' '), volume: taken.length > 0 ? taken.join(' ') : null };
}

export interface SplitTitle {
  /** The title with Hebrew quotes. */
  title: string;
  series: string;
  volume: string | null;
}

export function splitTitle(raw: string): SplitTitle {
  const title = hebrewQuotes(raw);
  const dash = topLevelDash(title);
  const head = dash < 0 ? title : title.slice(0, dash).trim();
  const tail = dash < 0 ? null : title.slice(dash + 1).trim() || null;
  const { series, volume } = trailingVolume(head);
  const parts = [volume, tail].filter((part): part is string => !!part);
  return { title, series, volume: parts.length > 0 ? parts.join(' - ') : null };
}

const LETTER_VALUES: Readonly<Record<string, number>> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

function numeralValue(word: string): number | null {
  const letters = word.replace(/^ה׳/, '').replace(/[״׳]/g, '');
  if (letters.length === 0 || letters.length > 4 || !/^[א-ת]+$/.test(letters)) return null;
  // A plain word is not a numeral: numerals of three or more letters carry gershayim.
  if (letters.length > 2 && !word.includes('״')) return null;
  let value = 0;
  for (const char of letters) value += LETTER_VALUES[char] ?? 0;
  return value;
}

/** The numbers a volume carries, in order (`תשמ״ה - חלק ב` is [745, 2]), for sorting a series. */
export function volumeNumbers(volume: string | null | undefined): number[] {
  if (!volume) return [];
  const numbers: number[] = [];
  for (const word of volume.replace(/[()]/g, ' ').split(/[\s\-–—]+/)) {
    const marker = /^ח״([א-ת])$/.exec(word);
    const value = marker ? LETTER_VALUES[marker[1]!]! : numeralValue(word);
    if (value !== null) numbers.push(value);
  }
  return numbers;
}

/** Orders two volumes by their numbers, then by their text. */
export function compareVolumes(a: string | null | undefined, b: string | null | undefined): number {
  const x = volumeNumbers(a);
  const y = volumeNumbers(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i]! - y[i]!;
  if (x.length !== y.length) return x.length === 0 ? 1 : y.length === 0 ? -1 : x.length - y.length;
  return (a ?? '').localeCompare(b ?? '', 'he');
}
