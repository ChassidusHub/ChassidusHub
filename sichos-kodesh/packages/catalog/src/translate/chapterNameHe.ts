import { gematriya } from '@hebcal/core';
import { CHAPTER_NAMES, CHAPTER_WORDS, ENGLISH_DAY_NUMBERS, ENGLISH_MONTHS, NAMED_DAYS_HE } from './chapterDictionary.js';

/**
 * JEM's English chapter name for a recording (`CatalogAudio.chapterName`,
 * ccdb's own label - "Sicha 1", "Ma'amar", "Two Nigunim") in Hebrew, for
 * the Hebrew UI - rule-based and deterministic, like translateOccasionLabel:
 * the name is split where it splits itself (commas, " - ", "and"), a
 * trailing number is a Hebrew numeral (Sicha 3 -> שיחה ג׳), a date is a
 * Hebrew date (Yud Zayin Tishrei, 5748 -> י״ז תשרי, תשמ״ח), and everything
 * else must be a name chapterDictionary.ts knows - otherwise null, and the
 * apps show JEM's English. Hebrew numerals and abbreviations use the
 * Hebrew UI's own geresh and gershayim (׳ ״), as @hebcal/core's gematriya
 * writes them.
 *
 *   Sicha 1          -> שיחה א׳
 *   Ma'amar          -> מאמר
 *   Nigun 2          -> ניגון ב׳
 *   Two Nigunim      -> שני ניגונים
 *   A Few Nigunim    -> כמה ניגונים
 *   Nigun Simcha     -> ניגון שמחה
 */
export function translateChapterName(name: string): string | null {
  const text = normalizeEnglish(name);
  if (!text) return null;
  const whole = CHAPTER_NAMES[text];
  if (whole !== undefined) return whole;
  const parts = splitParts(text);
  let out = '';
  for (const [index, part] of parts.entries()) {
    // "Dollars, <day>" names the distribution; "Dollars" alone is a chapter of one.
    const he = index === 0 && parts.length > 1 && part.text === 'dollars' ? 'חלוקת דולרים' : translatePart(part.text);
    if (he === null) return null;
    out += (out ? part.separator : '') + he;
  }
  return out || null;
}

/** Lower case, one kind of apostrophe and dash, single spaces, no trailing period - so one dictionary key reads every spelling JEM used. */
function normalizeEnglish(text: string): string {
  return text
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[—–]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(GLUED_DAY_MONTH, '$1 $2');
}

/** A day number run into its month with no space ("Chof DaledTishrei"). */
const GLUED_DAY_MONTH = new RegExp(`\\b(${Object.keys(ENGLISH_DAY_NUMBERS).join('|')})(${Object.keys(ENGLISH_MONTHS).join('|')})\\b`, 'g');

function splitParts(text: string): Array<{ text: string; separator: string }> {
  const parts: Array<{ text: string; separator: string }> = [];
  let depth = 0;
  let start = 0;
  let separator = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && char === ',') {
      parts.push({ text: text.slice(start, i), separator });
      separator = ', ';
      start = i + 1;
    } else if (depth === 0 && char === '-' && text[i - 1] === ' ' && text[i + 1] === ' ') {
      parts.push({ text: text.slice(start, i), separator });
      separator = ' - ';
      start = i + 1;
    }
  }
  parts.push({ text: text.slice(start), separator });
  return parts.map((part) => ({ ...part, text: part.text.trim() })).filter((part) => part.text !== '');
}

/** One part, possibly two or more names joined with "and" / "&" - Hebrew joins them with a ו. */
function translatePart(text: string): string | null {
  const whole = translateUnit(text);
  if (whole !== null) return whole;
  const pieces = text.split(/\s+(?:&|and)\s+/);
  if (pieces.length < 2) return null;
  const he = pieces.map(translateUnit);
  if (he.some((piece) => piece === null)) return null;
  return he.reduce((joined, piece) => `${joined} ו${piece}`);
}

function translateUnit(text: string): string | null {
  const s = text.trim();
  if (!s) return null;

  const known = CHAPTER_NAMES[s];
  if (known !== undefined) return known;

  // A parenthesis at the end: "Tzamah (Slow)", "Nigun 6 (Tzach Report)".
  const paren = /^(.*?)\s*\(([^()]*)\)$/.exec(s);
  if (paren) {
    const base = translateUnit(paren[1]!);
    const inner = translatePart(paren[2]!.replace(/^'|'$/g, ''));
    if (base !== null && inner !== null) return `${base} (${inner})`;
  }

  // Quotes around a name: Ma'amar 'K'ein Sicha'.
  const quoted = /^(.*?)\s+'(.+)'$/.exec(s);
  if (quoted) {
    const base = translateUnit(quoted[1]!);
    const inner = translateUnit(quoted[2]!);
    if (base !== null && inner !== null) return `${base} ${inner}`;
  }

  // A number after a name: "Sicha 3", "Two Nigunim #2", "Sicha 2 Translation".
  const numbered = /^(.*?)\s+#?(\d{1,2})(?:\s+(translation|rally|raly))?$/.exec(s);
  if (numbered) {
    const base = translateUnit(numbered[1]!);
    const n = Number(numbered[2]);
    if (base !== null && n >= 1) {
      const suffix = numbered[3] ? ` - ${CHAPTER_WORDS[numbered[3]]!}` : '';
      return `${base} ${gematriya(n)}${suffix}`;
    }
  }

  const date = translateDate(s);
  if (date !== null) return date;

  // A day with what it was: Leil X, Motzaei X, Ohr L'X, Erev X.
  const prefixed = /^(leil|motzaei|motzai|erev)\s+(.+)$/.exec(s);
  if (prefixed) {
    const rest = translateUnit(prefixed[2]!);
    const prefix = { leil: 'ליל', motzaei: 'מוצאי', motzai: 'מוצאי', erev: 'ערב' }[prefixed[1] as 'leil' | 'motzaei' | 'motzai' | 'erev'];
    if (rest !== null) return `${prefix} ${rest}`;
  }
  const ohr = /^ohr l'(.+)$/.exec(s);
  if (ohr) {
    const rest = translateDate(ohr[1]!);
    if (rest !== null) return `אור ל${rest}`;
  }

  // "... nidche(h)" (postponed) and "... after Minchah" after a day.
  const trailing = /^(.+?)\s+(nidche|nidcheh|after minchah)$/.exec(s);
  if (trailing) {
    const base = translateUnit(trailing[1]!);
    if (base !== null) return `${base} ${trailing[2] === 'after minchah' ? 'אחרי מנחה' : 'נדחה'}`;
  }

  // The Nth night of Chanukah.
  const chanukah = /^(\d)(?:st|nd|rd|th) night of chanuka(?:h)?$/.exec(s);
  if (chanukah) return `ליל ${gematriya(Number(chanukah[1]))} דחנוכה`;

  // A year, or a bare number.
  if (/^5\d{3}$/.test(s)) return gematriya(Number(s));
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{1,2}$/.test(s)) return gematriya(Number(s));

  // JEM's own date path: 5730/Tishrei/06.
  const path = /^(\d{4})\/([a-z-]+(?: i{1,2})?)\/(\d{1,2})$/.exec(s);
  if (path && ENGLISH_MONTHS[path[2]!]) return `${hebrewDay(Number(path[3]), ENGLISH_MONTHS[path[2]!]!)} ${ENGLISH_MONTHS[path[2]!]} ${gematriya(Number(path[1]))}`;

  // A name followed by a date with no comma between: "General Audience Chof Daled Nissan", "Ta'anis Esther 5748".
  const words = s.split(' ');
  for (let k = words.length - 1; k >= 1; k--) {
    const leftText = words.slice(0, k).join(' ');
    const left = CHAPTER_NAMES[leftText] ?? NAMED_DAYS_HE[leftText];
    if (left === undefined) continue;
    const right = translateDate(words.slice(k).join(' ')) ?? (/^5\d{3}$/.test(words.slice(k).join(' ')) ? gematriya(Number(words.slice(k).join(' '))) : null);
    if (right !== null) return `${left} ${right}`;
  }
  return null;
}

/** "Yud Zayin Tishrei", "18 Elul", "27 Adar II 5746", "Erev Rosh Hashana" -> י״ז תשרי, ח״י אלול, כ״ז אדר ב׳ תשמ״ו, ערב ר״ה. */
function translateDate(text: string): string | null {
  const named = NAMED_DAYS_HE[text];
  if (named !== undefined) return named;
  const m = /^(.+?)\s+([a-z-]+(?: ii?)?)(?:\s+(5\d{3}))?$/.exec(text);
  if (!m) return null;
  const month = ENGLISH_MONTHS[m[2]!];
  if (month === undefined) return null;
  const day = englishDayValue(m[1]!);
  if (day === null) return null;
  return `${hebrewDay(day, month)} ${month}${m[3] ? ` ${gematriya(Number(m[3]))}` : ''}`;
}

/** A day of the month in Hebrew numerals - but the 18th of Elul is ח״י אלול, as Chabad writes it. */
function hebrewDay(day: number, month: string): string {
  return day === 18 && month === 'אלול' ? 'ח״י' : gematriya(day);
}

/** "Yud Zayin" -> 17, "Chai" -> 18, "27" -> 27: a day of the month, as JEM spells it. */
function englishDayValue(text: string): number | null {
  if (/^\d{1,2}$/.test(text)) {
    const n = Number(text);
    return n >= 1 && n <= 30 ? n : null;
  }
  let sum = 0;
  for (const word of text.split(' ')) {
    const value = ENGLISH_DAY_NUMBERS[word];
    if (value === undefined) return null;
    sum += value;
  }
  return sum >= 1 && sum <= 30 ? sum : null;
}
