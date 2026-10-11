/**
 * Names for search results, in Hebrew, from the catalog's own fields. Shared
 * by the page and its loader; nothing here reads the API.
 */

/** One result as the Search screen draws it: a line, a quiet line under it, and where it opens. */
export interface Hit {
  /** What it is, for the top answer's small line: מאמר, שיחה, ספר, התוועדות… */
  kind: string;
  title: string;
  sub: string;
  to: string;
  /** Where to listen, when it has recordings. */
  listen?: string;
}

/** Words found inside a text: the words around them, which of them to mark, and whether a person has checked them. */
export interface WordHit {
  snippet: string;
  hits: string[];
  sub: string;
  to: string;
  machine: boolean;
}

export interface SearchPage {
  query: string;
  top: Hit | null;
  works: Hit[];
  events: Hit[];
  words: WordHit[];
  /** The search did not answer; the page says so rather than "nothing found". */
  failed?: boolean;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** A number in Hebrew letters with its geresh or gershayim: 19 → י״ט, 747 → תשמ״ז. */
export function hebrewNumeral(n: number): string {
  const rest = n % 100;
  const body = HUNDREDS[Math.floor((n % 1000) / 100)]! + (rest === 15 ? 'טו' : rest === 16 ? 'טז' : TENS[Math.floor(rest / 10)]! + ONES[rest % 10]!);
  if (body.length === 0) return '';
  return body.length === 1 ? `${body}׳` : `${body.slice(0, -1)}״${body.slice(-1)}`;
}

/** The months as date keys number them: Tishrei first, a leap year's Adar as 06A and 06B. */
const MONTHS: Record<string, string> = {
  '01': 'תשרי', '02': 'חשוון', '03': 'כסלו', '04': 'טבת', '05': 'שבט', '06': 'אדר', '06A': 'אדר א׳', '06B': 'אדר ב׳',
  '07': 'ניסן', '08': 'אייר', '09': 'סיוון', '10': 'תמוז', '11': 'אב', '12': 'אלול',
};

/**
 * A date key (5747-03-19, 5747-03, 5747) in Hebrew: י״ט כסלו תשמ״ז. The same
 * words packages/hebrew's describeDateKey writes; kept here until the search
 * API names its events itself.
 */
export function describeDate(key: string): string {
  const [year, month, day] = key.split('-');
  const parts = [day && hebrewNumeral(Number(day)), month && MONTHS[month], year && hebrewNumeral(Number(year))];
  return parts.filter(Boolean).join(' ') || key;
}

/** A label as printed, without the print's בס"ד and the closing full stop: "בס"ד. שיחת ש"פ בא." → "שיחת ש"פ בא". */
export function cleanLabel(label: string): string {
  return label
    .replace(/^\s*ב["״]ה[.,]?\s*|^\s*בס["״]ד[.,]?\s*/, '')
    .replace(/[*.\s]+$/, '')
    .trim();
}

/** What a sefer's units are called, by the sefer's kind. */
export const UNIT_KIND: Record<string, string> = {
  maamarim: 'מאמר',
  sichos: 'שיחה',
  igros: 'מכתב',
  chassidus: 'פרק',
  halacha: 'סימן',
  diaries: 'רשימה',
  history: 'פרק',
  minhagim: 'פרק',
  siddur: 'תפילה',
  recordings: 'הקלטה',
};

/** The words of a snippet, with the ones that matched marked: what <mark> wraps. */
export function markWords(snippet: string, hits: readonly string[]): { text: string; marked: boolean }[] {
  const clean = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, '');
  const wanted = new Set(hits.map(clean).filter(Boolean));
  const tokens = snippet.split(/(\s+)/);
  const isMarked = (at: number) => wanted.has(clean(tokens[at] ?? ''));
  const out: { text: string; marked: boolean }[] = [];
  tokens.forEach((token, at) => {
    // A space between two marked words is marked too, so a phrase is one mark.
    const marked = /^\s+$/.test(token) ? isMarked(at - 1) && isMarked(at + 1) : isMarked(at);
    const last = out[out.length - 1];
    if (last && last.marked === marked) last.text += token;
    else if (token) out.push({ text: token, marked });
  });
  return out;
}
