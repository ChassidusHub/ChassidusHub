const LETTER_VALUES: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

/**
 * The value of a Hebrew numeral as the Igros volumes print letter numbers:
 * `ג'ערה` is 3275 (a letter followed by a geresh counts thousands). The
 * letters are summed, so their order does not matter - the volumes write
 * some numbers out of order on purpose (`תשדמ` for 744, avoiding the word
 * שמד). Returns null when there is no Hebrew letter at all.
 */
export function parseHebrewNumeral(text: string): number | null {
  const normalized = text.replace(/[׳’`]/g, "'").replace(/\s+/g, '');
  const thousands = normalized.match(/^([א-ת])'(.*)$/);
  let value = 0;
  let rest = normalized;
  if (thousands) {
    value = (LETTER_VALUES[thousands[1]!] ?? 0) * 1000;
    rest = thousands[2]!;
  }
  let sawLetter = Boolean(thousands);
  for (const char of rest) {
    const letter = LETTER_VALUES[char];
    if (letter === undefined) continue;
    value += letter;
    sawLetter = true;
  }
  return sawLetter ? value : null;
}

/** A letter's number as printed: the numeral, then one asterisk per supplement (`קמא*` is 141a). */
export interface LetterNumber {
  number: number;
  /** '' for a regular letter, 'a' for one asterisk, 'b' for two. */
  suffix: string;
  /** The numeral as printed, asterisks included, spaces removed (`קמא*`). */
  label: string;
}

export function parseLetterNumber(text: string): LetterNumber | null {
  const label = text.replace(/&nbsp;| /g, ' ').replace(/\s+/g, '');
  const stars = (label.match(/\*/g) ?? []).length;
  const number = parseHebrewNumeral(label.replace(/\*/g, ''));
  if (number === null) return null;
  return { number, suffix: stars > 0 ? String.fromCharCode(96 + stars) : '', label };
}

/**
 * The Hebrew year a letter's date line names: `ב"ה, ט"ו שבט, תשט"ו` is
 * 5715; `ה'תשי"ז`, `התש"י` and `השי"ת` carry the thousands `ה` (5717,
 * 5710, 5710); the earliest letters write two letters, `צ"ח` for 5698.
 * A year is a token written with gershayim that starts with ת or ש
 * (5600-5799) or with פ or צ (5680-5699) - none of the date line's other
 * abbreviations (ב"ה, ט"ו, מנ"א, אדר"ח, ער"ח) starts with those. The first
 * such token wins: a line that quotes an earlier letter's date puts it
 * second. Null when the line names no year.
 */
export function yearFromDateLine(line: string): number | null {
  for (const raw of line.split(/[\s,.;:()[\]]+/)) {
    const token = raw.replace(/״/g, '"').replace(/^ה['׳]?(?=[תשפצ])/, '');
    if (!/^[א-ת]+"[א-ת]$/.test(token)) continue;
    const value = parseHebrewNumeral(token);
    if (value === null) continue;
    if (/^[תש]/.test(token) && value >= 600 && value <= 799) return 5000 + value;
    if (/^[פצ]/.test(token) && value >= 80 && value <= 99) return 5600 + value;
  }
  return null;
}
