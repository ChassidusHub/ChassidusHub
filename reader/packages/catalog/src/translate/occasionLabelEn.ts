import { englishOrdinal, HEBREW_NUMERAL_SOURCE, hebrewDayValue, hebrewNumeralValue, hebrewYearValue, normalizeHebrewText } from './hebrewNumerals.js';
import { AUDIENCE_CHUNKS, GROUP_TO_KEYS, MONTHS, NAMED_DAYS, NUMBERED_OCCASIONS, PARSHIYOS, PHRASES } from './occasionDictionary.js';

/**
 * mafteiach.app's Hebrew occasion label (`CatalogEntry.occasionLabel`) in
 * English, for the English UI - rule-based and deterministic: the label is
 * split where it splits itself (commas, " - ", a parenthesis), and every
 * part must be something these rules know - a date, a parsha, a Yom Tov
 * and its day, Rosh Chodesh, a time of day, who a sicha was said to - or
 * the whole label is left untranslated (null) and the apps show the
 * Hebrew. Never a guess: a label with one unknown word gets no English.
 *
 *   יום ב' דר"ה                  -> Rosh Hashanah, day 2
 *   ו' תשרי                      -> 6 Tishrei
 *   מוצאי י"ג תשרי               -> Motzei 13 Tishrei
 *   ליל שמח"ת, לפני הקפות        -> Simchas Torah night, before hakafos
 *   בראשית, מבה"ח וער"ח מ"ח      -> Bereishis, Shabbos Mevarchim and Erev Rosh Chodesh Cheshvan
 *
 * Names follow the Ashkenazi (Chabad) pronunciation the rest of the app
 * uses (Bereishis, Sukkos, Shabbos), the months are the app's own month
 * names (mafteiachMonth.ts), and a day of the month is a plain number, as
 * the English UI's month and special-day filters already show it.
 */
export function translateOccasionLabel(label: string): string | null {
  const text = normalizeHebrewText(label).replace(/[\s,]+$/, '');
  if (!text) return null;
  const bracketed = /^\[(.*)\]$/.exec(text);
  const inner = bracketed ? bracketed[1]! : text;
  const en = translateList(inner, { to: 'to' });
  if (!en) return null;
  return capitalize(bracketed ? `[${en}]` : en);
}

// ---------------------------------------------------------------------------
// Nodes: what one part of a label means, rendered only once its prefix
// (ליל, מוצאי, ערב, אור ל) is known - "Simchas Torah night" but "Night of
// 13 Tishrei", "Rosh Hashanah, day 2" but "Sukkos, night 4".

type Node =
  | { kind: 'date'; en: string; suffix?: string }
  | { kind: 'named'; en: string; suffix?: string }
  | { kind: 'numbered'; name: string; n: number; suffix?: string }
  | { kind: 'light'; n: number; suffix?: string }
  | { kind: 'text'; en: string; suffix?: string }
  /** A piece of a phrase ("sicha", "to the students", "of Beis Rivkah") - joined to its neighbours with a space, not a comma. */
  | { kind: 'chunk'; en: string; suffix?: string };

function render(node: Node): string {
  let en: string;
  switch (node.kind) {
    case 'numbered':
      en = `${node.name}, day ${node.n}`;
      break;
    case 'light':
      en = `${englishOrdinal(node.n)} Chanukah light`;
      break;
    default:
      en = node.en;
  }
  return en + (node.suffix ?? '');
}

/** ליל X: the night that begins X. Lower case - the label's first letter is capitalized once, at the end. */
function night(node: Node): Node | null {
  if (node.suffix) return null;
  switch (node.kind) {
    case 'numbered':
      return { kind: 'named', en: `${node.name}, night ${node.n}` };
    case 'named':
      return { kind: 'named', en: `${node.en} night` };
    case 'date':
      return { kind: 'named', en: `night of ${node.en}` };
    case 'light':
      return { kind: 'named', en: `night of the ${englishOrdinal(node.n)} Chanukah light` };
    default:
      return null;
  }
}

/** יום X: the day (as against the night) of a named day - יום שמח"ת. A numbered day (יום ב' דר"ה) is its own rule. */
function day(node: Node): Node | null {
  return node.kind === 'named' && !node.suffix ? { kind: 'named', en: `${node.en} day` } : null;
}

/** אור ל-X: the evening leading into X. */
function eve(node: Node): Node | null {
  if (node.suffix) return null;
  switch (node.kind) {
    case 'date':
    case 'named':
      return { kind: 'named', en: `eve of ${node.en}` };
    case 'light':
      return { kind: 'named', en: `eve of the ${englishOrdinal(node.n)} Chanukah light` };
    default:
      return null;
  }
}

/** מוצאי X: the night after X ends. */
function motzei(node: Node): Node | null {
  if (node.suffix) return null;
  switch (node.kind) {
    case 'date':
    case 'named':
      return { kind: 'named', en: `Motzei ${node.en}` };
    case 'numbered':
      return { kind: 'named', en: `Motzei ${node.name}, day ${node.n}` };
    case 'light':
      return { kind: 'named', en: `Motzei the ${englishOrdinal(node.n)} Chanukah light` };
    default:
      return null;
  }
}

/** ערב X: the day before X. */
function erev(node: Node): Node | null {
  if (node.suffix) return null;
  switch (node.kind) {
    case 'date':
    case 'named':
      return { kind: 'named', en: node.en.startsWith('the ') ? `the eve of ${node.en}` : `Erev ${node.en}` };
    default:
      return null;
  }
}

interface Prefix {
  re: RegExp;
  apply: (node: Node) => Node | null;
}

const PREFIXES: Prefix[] = [
  { re: /^ליל\s+/, apply: night },
  { re: /^יום\s+/, apply: day },
  { re: /^אור\s+ל/, apply: eve },
  { re: /^מוצאי\s+/, apply: motzei },
  { re: /^ערב\s+/, apply: erev },
];

// ---------------------------------------------------------------------------
// Rules: one part of a label, matched at the start of what is left.

/** Where a word may end: the end, a space, or punctuation that starts the next part. */
const END = `(?=$|[\\s,;()\\-])`;
const NUM = HEBREW_NUMERAL_SOURCE;

interface Context {
  /** How a group addressed with ל reads: "sicha to the guests", but a yechidus "for" them. */
  to: 'to' | 'for';
}

interface Rule {
  re: RegExp;
  make: (m: RegExpExecArray, ctx: Context) => Node | null;
}

function alternation(keys: Iterable<string>): string {
  return [...keys]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
}

const MONTH_ALT = alternation(Object.keys(MONTHS));
const PARSHA_ALT = alternation(Object.keys(PARSHIYOS));
const NUMBERED_ALT = alternation(Object.keys(NUMBERED_OCCASIONS));

function month(token: string): string {
  return MONTHS[token]!;
}

function dateNode(dayToken: string, monthToken: string, toDayToken?: string): Node | null {
  const day = hebrewDayValue(dayToken);
  if (day === null) return null;
  if (toDayToken === undefined) return { kind: 'date', en: `${day} ${month(monthToken)}` };
  const toDay = hebrewDayValue(toDayToken);
  return toDay !== null && toDay > day ? { kind: 'date', en: `${day}-${toDay} ${month(monthToken)}` } : null;
}

function dictionaryRule(dictionary: Record<string, string>, kind: 'named' | 'text'): Rule {
  return {
    re: new RegExp(`^(${alternation(Object.keys(dictionary))})${END}`),
    make: (m) => ({ kind, en: dictionary[m[1]!]! }),
  };
}

const RULES: Rule[] = [
  // A Yom Tov's (or Chanukah's, or Rosh Chodesh's) Nth day: יום ב' דר"ה, ב' דחוה"מ, ג' דסליחות.
  {
    re: new RegExp(`^(?:יום\\s+)?(${NUM})\\s+ד(${NUMBERED_ALT})${END}`),
    make: (m) => {
      const n = hebrewNumeralValue(m[1]!);
      return n !== null && n >= 1 && n <= 9 ? { kind: 'numbered', name: NUMBERED_OCCASIONS[m[2]!]!, n } : null;
    },
  },
  // Rosh Chodesh: ר"ח, its first day (אדר"ח), its second (בדר"ח), and the day before (ער"ח).
  {
    re: new RegExp(`^(ר"ח|ער"ח|אדר"ח|בדר"ח|א' דר"ח|ב' דר"ח)\\s+(${MONTH_ALT})${END}`),
    make: (m) => {
      const name = `Rosh Chodesh ${month(m[2]!)}`;
      switch (m[1]) {
        case 'ר"ח':
          return { kind: 'named', en: name };
        case 'ער"ח':
          return { kind: 'named', en: `Erev ${name}` };
        case 'אדר"ח':
        case `א' דר"ח`:
          return { kind: 'numbered', name, n: 1 };
        default:
          return { kind: 'numbered', name, n: 2 };
      }
    },
  },
  // Shabbos Mevarchim, sometimes also Erev Rosh Chodesh: מבה"ח (וער"ח) כסלו.
  {
    re: new RegExp(`^מבה"ח\\s+(וער"ח\\s+)?(${MONTH_ALT})${END}`),
    make: (m) => ({ kind: 'named', en: `Shabbos Mevarchim ${m[1] ? 'and Erev Rosh Chodesh ' : ''}${month(m[2]!)}` }),
  },
  // A Chanukah light: נר ה' דחנוכה.
  {
    re: new RegExp(`^נר\\s+(${NUM})\\s+[דל]חנוכה${END}`),
    make: (m) => {
      const n = hebrewNumeralValue(m[1]!);
      return n !== null && n >= 1 && n <= 8 ? { kind: 'light', n } : null;
    },
  },
  // A year: תשכ"ח, שנת תשכ"ט, חורף תשכ"ד.
  {
    re: new RegExp(`^(שנת\\s+|חורף\\s+|קיץ\\s+)?(ת[א-ת]{0,2}"[א-ת])${END}`),
    make: (m) => {
      const year = hebrewYearValue(m[2]!);
      if (year === null) return null;
      const season = m[1]?.trim();
      return { kind: 'named', en: season === 'חורף' ? `winter ${year}` : season === 'קיץ' ? `summer ${year}` : String(year) };
    },
  },
  dictionaryRule(NAMED_DAYS, 'named'),
  dictionaryRule(PHRASES, 'text'),
  // A date, or a span of dates: י"ג תשרי, ט' באב, י"ד-ט"ז שבט.
  {
    re: new RegExp(`^(${NUM}|יו"ד|כ"ף)(?:-(${NUM}|יו"ד|כ"ף))?\\s+ב?(${MONTH_ALT})${END}`),
    make: (m) => dateNode(m[1]!, m[3]!, m[2]),
  },
  // A month on its own: תשרי, חודש תשרי, שלהי מנ"א.
  {
    re: new RegExp(`^(חודש\\s+|שלהי\\s+)?(${MONTH_ALT})${END}`),
    make: (m) => {
      const name = month(m[2]!);
      if (!m[1]) return { kind: 'named', en: name };
      return { kind: 'named', en: m[1].startsWith('חודש') ? `the month of ${name}` : `late ${name}` };
    },
  },
  // A parsha, as the Shabbos itself or the night after or the day before it: בשלח, ש"פ בשלח, מוצש"פ בשלח.
  {
    re: new RegExp(`^(?:(ש"פ|מוצש"פ|מוצשק"פ|מוצאי ש"פ|עש"פ|עשק"פ|ערש"פ)\\s+(?:ש"פ\\s+)?)?(${PARSHA_ALT})${END}`),
    make: (m) => {
      const parsha = PARSHIYOS[m[2]!]!;
      switch (m[1]) {
        case undefined:
          return { kind: 'named', en: parsha };
        case 'ש"פ':
          return { kind: 'named', en: `Shabbos ${parsha}` };
        case 'עש"פ':
        case 'עשק"פ':
        case 'ערש"פ':
          return { kind: 'named', en: `Erev Shabbos ${parsha}` };
        default:
          return { kind: 'named', en: `Motzei Shabbos ${parsha}` };
      }
    },
  },
  // A weekday: יום א'.
  {
    re: new RegExp(`^יום\\s+(${NUM})${END}`),
    make: (m) => {
      const n = hebrewNumeralValue(m[1]!);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      return n !== null && n >= 1 && n <= 6 ? { kind: 'named', en: days[n - 1]! } : null;
    },
  },
  // Which farbrengen of the day: התוועדות א, התוועדות ב'.
  {
    re: new RegExp(`^התוועדות\\s+([א-ט]'?)${END}`),
    make: (m) => {
      const n = hebrewNumeralValue(m[1]!.endsWith("'") ? m[1]! : `${m[1]}'`);
      return n === null ? null : { kind: 'text', en: `farbrengen ${n}` };
    },
  },
];

/** "continuing Simchas Torah" - the second farbrengen of a day, carried over from the one before. */
const CONTINUATION = /^המשך\s+([למ])/;

// ---------------------------------------------------------------------------
// The audience and circumstance phrases (who a sicha was said to, whose
// visit, which distribution) are translated chunk by chunk - each chunk a
// whole Hebrew phrase with its prefix letters (ל, ד, ו, מ) and its English
// with the matching preposition, in the Hebrew order, which is also the
// English one: להמסיימות ד"בית רבקה" -> to the graduates of Beis Rivkah.

const CHUNKS = new Map(Object.entries(AUDIENCE_CHUNKS).map(([he, en]) => [normalizeHebrewText(he), en]));
const CHUNK_KEYS = [...CHUNKS.keys()].sort((a, b) => b.length - a.length);
const GROUP_TO = new Set([...GROUP_TO_KEYS].map(normalizeHebrewText));

/** Every chunk that starts `s`, longest first. */
function* chunksAt(s: string, ctx: Context): Generator<Unit> {
  for (const key of CHUNK_KEYS) {
    if (!s.startsWith(key)) continue;
    const next = s.charAt(key.length);
    if (next && !/[\s,;()\-]/.test(next)) continue;
    let en = CHUNKS.get(key)!;
    if (ctx.to === 'for' && GROUP_TO.has(key)) en = `for ${en.slice(3)}`;
    yield { node: { kind: 'chunk', en }, rest: s.slice(key.length) };
  }
}

// ---------------------------------------------------------------------------
// Parsing: a label is a list of parts; a part is a sequence of units, each
// unit one rule's match (with its prefix applied) - parsed with
// backtracking, so a word two rules could claim (אחרי is a parsha and
// "after") takes the reading that lets the whole part parse.

interface Unit {
  node: Node;
  rest: string;
}

function* units(s: string, ctx: Context, depth = 0): Generator<Unit> {
  if (depth < 3) {
    for (const prefix of PREFIXES) {
      const m = prefix.re.exec(s);
      if (!m) continue;
      for (const inner of units(s.slice(m[0].length), ctx, depth + 1)) {
        if (inner.node.kind === 'chunk' || inner.node.kind === 'text') continue;
        const node = prefix.apply(inner.node);
        if (node) yield { node, rest: inner.rest };
      }
    }
    const continuation = CONTINUATION.exec(s);
    if (continuation) {
      for (const inner of units(s.slice(continuation[0].length), ctx, depth + 1)) {
        if (inner.node.kind === 'chunk' || inner.node.kind === 'text') continue;
        yield { node: { kind: 'text', en: `${continuation[1] === 'מ' ? 'continued from' : 'continuing'} ${render(inner.node)}` }, rest: inner.rest };
      }
    }
  }
  for (const rule of RULES) {
    const m = rule.re.exec(s);
    if (!m) continue;
    const node = rule.make(m, ctx);
    if (node) yield { node, rest: s.slice(m[0].length) };
  }
  yield* chunksAt(s, ctx);
}

function matchingParen(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** A parenthesis: a list of its own, or just a number - "(א)" is the first of several groups. */
function translateParen(inner: string, ctx: Context): string | null {
  const trimmed = inner.trim();
  if (/^[א-ט]'?$/.test(trimmed)) return String(hebrewNumeralValue(trimmed.endsWith("'") ? trimmed : `${trimmed}'`));
  return translateList(trimmed, ctx);
}

function parseSequence(s: string, ctx: Context): Node[] | null {
  const text = s.trim();
  if (!text) return [];
  if (text.startsWith('(')) {
    const close = matchingParen(text);
    if (close < 0) return null;
    const inner = translateParen(text.slice(1, close), ctx);
    const tail = inner === null ? null : parseSequence(text.slice(close + 1), ctx);
    return inner === null || !tail ? null : [{ kind: 'text', en: `(${inner})` }, ...tail];
  }
  for (const unit of units(text, ctx)) {
    let node = unit.node;
    let rest = unit.rest.trimStart();
    if (rest.startsWith('(')) {
      const close = matchingParen(rest);
      if (close < 0) continue;
      const innerCtx: Context = /yechidus/i.test(render(node)) ? { to: 'for' } : ctx;
      const inner = translateParen(rest.slice(1, close), innerCtx);
      if (inner === null) continue;
      node = { ...node, suffix: `${node.suffix ?? ''} (${inner})` };
      rest = rest.slice(close + 1);
    }
    const tail = parseSequence(rest, ctx);
    if (tail) return [node, ...tail];
  }
  return null;
}

function renderSequence(nodes: Node[]): string {
  let out = '';
  let previous: Node | null = null;
  for (const node of nodes) {
    const en = render(node);
    if (!en) continue;
    if (previous) out += previous.kind === 'chunk' && node.kind === 'chunk' ? ' ' : ', ';
    out += en;
    previous = node;
  }
  return out;
}

/** Splits at commas, semicolons and " - " outside any parenthesis, keeping which separator it was. */
function splitParts(text: string): Array<{ text: string; separator: string }> {
  const parts: Array<{ text: string; separator: string }> = [];
  let depth = 0;
  let start = 0;
  let separator = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (depth === 0 && (char === ',' || char === ';')) {
      parts.push({ text: text.slice(start, i), separator });
      separator = char === ',' ? ', ' : '; ';
      start = i + 1;
    } else if (depth === 0 && char === '-' && text[i - 1] === ' ' && text[i + 1] === ' ') {
      parts.push({ text: text.slice(start, i), separator });
      separator = ' - ';
      start = i + 1;
    }
  }
  parts.push({ text: text.slice(start), separator });
  return parts.filter((part) => part.text.trim() !== '');
}

function translateList(text: string, ctx: Context): string | null {
  let out = '';
  for (const part of splitParts(text)) {
    const nodes = parseSequence(part.text, ctx);
    if (!nodes || nodes.length === 0) return null;
    const en = renderSequence(nodes);
    if (!en) return null;
    out += (out ? part.separator : '') + en;
  }
  return out ? polish(out) : null;
}

/** Small English fixes the chunk-by-chunk translation cannot see on its own. */
function polish(en: string): string {
  return en.replace(/\byechidus to\b/g, 'yechidus for').replace(/\s+/g, ' ').trim();
}

/** Capitalizes the label's first word - unless it starts with a number ("5th Chanukah light"). */
function capitalize(text: string): string {
  const i = text.search(/[A-Za-z0-9]/);
  return i < 0 || /[0-9]/.test(text.charAt(i)) ? text : text.slice(0, i) + text.charAt(i).toUpperCase() + text.slice(i + 1);
}
