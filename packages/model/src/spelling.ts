/**
 * One spelling for the Rebbe's Yiddish in transcripts: the farbrengen
 * booklets' written style (The steward, 2026-09-29: "booklets is good"). Most
 * booklets write אויך, דעמאלט, ברענגט, וואנענט and keep abbreviations as
 * written (ע"י). People correcting a transcript are shown it, so what they
 * check trains the next model in one spelling; the training run rewrites
 * other texts into it the same way (the transcripts thread's spelling.py,
 * which follows this list: this copy is the master). The editor only
 * hints; `toHouseSpelling` is the rewrite a training run makes.
 */

/** Whole words, as sometimes written by ear, and as the booklets write them. */
export const HOUSE_SPELLING_WORDS: Readonly<Record<string, string>> = {
  אויכעט: 'אויך',
  דעמולט: 'דעמאלט',
  וואנעט: 'וואנענט',
  ואדרבה: 'ואדרבא',
  אדרבה: 'אדרבא',
  קאן: 'קען',
  קאנען: 'קענען',
  געקאנט: 'געקענט',
  יעדערען: 'יעדערן',
  גוים: 'גויים',
  תהילים: 'תהלים',
  שלושה: 'שלשה',
  שלושים: 'שלשים',
  שישים: 'ששים',
};

/** Inside words too (אראפבריינגען, בחמישה). */
export const HOUSE_SPELLING_PARTS: Readonly<Record<string, string>> = {
  בריינג: 'ברענג',
  פארליינג: 'פארלאנג',
  חמישה: 'חמשה',
};

/** After עם, words that make it Loshon Kodesh (עם ישראל, עם זה); otherwise עם is the Yiddish "him", written אים. */
export const HOUSE_SPELLING_HEBREW_AFTER: ReadonlySet<string> = new Set(['זה', 'ישראל', 'הדרת', 'הארץ', 'אחד', 'כל', 'קדוש', 'סגולה', 'ולשון', 'נח', 'לבדד', 'ועם', 'בני', 'חכם', 'נבון', 'רב']);

/** A token's leading marks, a מ' or ס' contraction, its word, and its trailing marks. */
function parts(token: string): [string, string, string, string] {
  const m = /^([^א-ת]*)((?:[מס]')?)(.*?)([^א-ת']*)$/.exec(token)!;
  return [m[1]!, m[2]!, m[3]!, m[4]!];
}

function houseWord(word: string): string {
  let house = HOUSE_SPELLING_WORDS[word] ?? word;
  for (const [from, to] of Object.entries(HOUSE_SPELLING_PARTS)) house = house.replaceAll(from, to);
  return house;
}

/**
 * What may follow a ' inside one word: Yiddish endings on a Loshon Kodesh
 * word (רבי'ן, פסק'נט, חסיד'ישע, גוי'שקייט, יעקב'ס, אמת'ער).
 */
const ENDING_AFTER_APOSTROPHE = /^(?:ן|ען|נען|ענען|ס|ער|ערס|ערן|ע|עס|ט|טע|טן|נט|ענט|עט|נדיק\S*|עווען|יש|ישע|ישער|ישן|ישקייט|שקייט|קייט|דיק\S*|ניק|לעך|ל|נ|עלע)$/;
/** Yiddish prefixes written with a ' before a Loshon Kodesh word (גע'פועל'ט, איבער'חזר'ן, אריינ'טענה'ט). */
const PREFIX_BEFORE_APOSTROPHE = /(?:^|ג)ע$|^(?:איבער|אריינ|ארויס|אפ|אויס|פאר|צו|איינ|אונטער|דורכ|נאכ|מיט|אנ|אויפ|ארומ|צוריק|ארונטער|ארויפ)$/;

/**
 * Two words a ' was left gluing together (הוי'אלקיך, ראי'פון, וכו'וכו, ה'פון):
 * the booklets' text lost the space after a ' where the line was set, the
 * models learned it from them, and people fixing transcripts take it out
 * again. A Yiddish ending (רבי'ן) or prefix (גע'פועל) stays one word.
 */
export function splitGluedApostrophes(token: string): string {
  const m = /^([^\s']*[א-ת"])'([א-ת][^\s]*)$/.exec(token);
  if (!m) return token;
  const [, before, after] = m as unknown as [string, string, string];
  const letters = after.replace(/[^א-ת'].*$/, '');
  const head = before.replace(/^[^א-ת]+/, '');
  // ס'איז and מ'האט are one word; a lone letter otherwise is a number or a name's mark (ה' פון, ד' אמות).
  if (head === 'ס' || head === 'מ' || head === 'וס' || head === 'ומ') return token;
  if (letters.length < 2 || ENDING_AFTER_APOSTROPHE.test(letters.split("'")[0]!) || PREFIX_BEFORE_APOSTROPHE.test(head)) return token;
  return `${before}' ${splitGluedApostrophes(after)}`;
}

/**
 * An abbreviation's ״ as a model or a typist wrote it otherwise: רש'י,
 * הקב'ה, רמב'ם, הקב,"ה, חז.ל all mean רש"י, הקב"ה, רמב"ם, חז"ל. A ' before
 * a last ס or ן after a longer word is a Yiddish ending (יעקב'ס, רבי'ן),
 * and stays.
 */
export function fixAbbreviationMark(token: string): string {
  const m = /^([^א-ת]*)([א-ת]{1,6})(?:,"|",|"\.|\."|\.|')([א-ת])([^א-ת]*)$/.exec(token);
  if (!m) return token;
  const [, lead, head, last, trail] = m as unknown as [string, string, string, string, string];
  const apostrophe = token.slice(lead.length + head.length, token.length - last.length - trail.length) === "'";
  if (apostrophe && (last === 'ן' || (last === 'ס' && head.length > 2) || head.length === 1)) return token;
  return `${lead}${head}"${last}${trail}`;
}

/** A text rewritten into the house spelling, word for word (and ׳ ״ as ' "): what a training run does to text written otherwise. */
export function toHouseSpelling(text: string): string {
  const tokens = text
    .replaceAll('׳', "'")
    .replaceAll('״', '"')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) => splitGluedApostrophes(t).split(' '))
    .map(fixAbbreviationMark);
  return tokens
    .map((token, i) => {
      const [lead, contraction, word, trail] = parts(token);
      let house = houseWord(word);
      if (word === 'עם' && !contraction) {
        const next = i + 1 < tokens.length ? parts(tokens[i + 1]!)[2] : '';
        if (!HOUSE_SPELLING_HEBREW_AFTER.has(next) && !next.startsWith("ה'")) house = 'אים';
      }
      return lead + contraction + house + trail;
    })
    .join(' ');
}

/** The words of a text written other than the house way, each once, with the house spelling; עם is left alone (often Loshon Kodesh). */
export function spellingHints(text: string): Array<{ written: string; house: string }> {
  const hints = new Map<string, string>();
  if (/[׳״]/.test(text)) hints.set('׳ ״', `' "`);
  for (const token of text.replaceAll('׳', "'").split(/\s+/)) {
    const word = parts(token)[2];
    if (!word) continue;
    const house = houseWord(word);
    if (house !== word) hints.set(word, house);
  }
  return [...hints].map(([written, house]) => ({ written, house }));
}

/**
 * Abbreviations the models hear as words and write out by sound, as people
 * fixing transcripts have corrected them again and again (the reviews of
 * 2026-09-29 to 10-05): עאכו כמה וכמה for עאכו"כ, משא נכן for משא"כ.
 */
export const HEARD_ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ['ועאכו כמה וכמה', 'ועאכו"כ'],
  ['עאכו כמה וכמה', 'עאכו"כ'],
  ['משא נכן', 'משא"כ'],
  ['משא-כן', 'משא"כ'],
  ['חב אד', 'חב"ד'],
  ['שד ו', 'שד"י'],
  ['יווד', 'יו"ד'],
  // The last letter swallowed by the next word (רש'זאגט, הקב'איז), once that word is set apart.
  ["רש'", 'רש"י'],
  ["הקב'", 'הקב"ה'],
];

/**
 * A machine transcript's words tidied before anyone reads them: the house
 * spelling (with glued words after a ' apart and abbreviation marks as
 * ״), and abbreviations heard as words written as abbreviations. Words
 * are only respelled here, never guessed: a word heard wrong stays for a
 * person, or the next model, to fix.
 */
export function tidyHeard(text: string): string {
  let out = ` ${toHouseSpelling(text)} `;
  for (const [heard, written] of HEARD_ABBREVIATIONS) out = out.replace(new RegExp(`(?<=\\s)${heard.replace(/[-"]/g, (c) => `\\${c}`)}(?=[\\s,.;:!?])`, 'g'), written);
  return out.trim();
}
