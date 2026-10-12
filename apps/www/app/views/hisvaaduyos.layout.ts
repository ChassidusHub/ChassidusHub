import type { PageSegment } from '@chassidushub/model';
import type { WordsContext, WordsLayout } from '../reader/words.server';

/** Whether the Rebbe edited it (RFC 0004 `muga`): edited, unedited, or a listener's hanacha. */
export type Muga = 'mugah' | 'bilti-mugah' | 'hanacha';

/** A section of a farbrengen (its letter, א, ב, ג) and where on the page it starts. */
export interface FarbrengenSection {
  label: string;
  id: string;
}

/** Another piece said at the same farbrengen: its maamar on a sicha's page, its sichos on a maamar's. */
export interface SaidThere {
  path: string;
  /** The maamar's ד"ה, or the sichos' own name. */
  label: string;
  kind: 'maamar' | 'sichos';
}

/** A segment's words, with the print's quotes made plain, to be read by the rules below. */
const wordsOf = (segment: PageSegment) =>
  (segment.text ?? [])
    .map((inline) => ('text' in inline ? inline.text : ''))
    .join('')
    .replace(/״/g, '"')
    .replace(/׳/g, "'")
    .trim();

const LETTERS: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
/** A section letter's number (יא = 11, טו = 15), or 0 when the letters are not one. */
const numberOf = (letters: string) => [...letters].reduce((sum, letter) => sum + (LETTERS[letter] ?? NaN), 0) || 0;

/** A section's letter at the start of its paragraph, as Toras Menachem and the Sichos Kodesh hanachos print it: "א. ", "יא. ". */
const SECTION = /^([א-ת]{1,3})\.\s/;

/**
 * What happened between the words, as printed: "(וסיים כ"ק אדמו"ר שליט"א:)",
 * "[כ"ק אדמו"ר שליט"א צוה לנגן …]", "כ"ק אדמו"ר שליט"א נטל ידיו הק' לסעודה."
 * Until schema 18 gives them a kind of their own (`stage`), a stage direction
 * is a short paragraph wrapped whole in brackets that says what was sung,
 * said or done, or one that opens with the Rebbe's title and does so. A long
 * bracket is the Rebbe's own remark (ולהעיר …), and stays in the words.
 * Checked on Toras Menachem's text (chabadlibrary 1400000000, 6,000 pages).
 */
const STAGE_WORDS = /(?<![א-ת])(לנגן|ניגון|ניגנו|נטל ידיו|לחיים|ואמר|אמר:|המשיך|סיים|וסיים|בכה|מאמר ד"ה|נכנס|יצא|הורה|צוה|פנה|לומר:)/;
/** What was sung or done, not only said. */
const SUNG = /(?<![א-ת])(לנגן|ניגון|ניגנו|נטל ידיו|לחיים|צוה|הורה)/;
const REMARK = /^[[(](ולהעיר|ויש להוסיף|ואע"פ|ולהוסיף)/;
const STAGE_MOST = 240;

function isStage(segment: PageSegment): boolean {
  if ((segment.kind as string) === 'stage') return true;
  if (segment.kind !== 'paragraph') return false;
  const runs = (segment.text ?? []).filter((inline) => 'text' in inline && inline.text.trim());
  // A paragraph the print sets small (RFC 0004): the stage line as the source marks it.
  if (runs.length && runs.every((inline) => 'marks' in inline && inline.marks?.includes('small'))) return true;
  const words = wordsOf(segment).replace(SECTION, '').trim();
  if (words.length < 4 || words.length > STAGE_MOST || REMARK.test(words)) return false;
  const closed = words.replace(/[.\s]+$/, '');
  const wrapped = (words[0] === '(' && closed.endsWith(')')) || (words[0] === '[' && closed.endsWith(']'));
  if (wrapped && (STAGE_WORDS.test(words) || /:\s*[)\]]$/.test(closed))) return true;
  if (words.length > 200) return false;
  if (/^\[?כ"ק אדמו"ר( שליט"א)? /.test(words) && STAGE_WORDS.test(words)) return true;
  // "אחרי המאמר צוה כ"ק אדמו"ר שליט"א לנגן …": the Rebbe named near the start, and what was sung or done.
  const named = words.indexOf('כ"ק אדמו"ר שליט"א');
  // Not a bracketed line that the words run on after: those words are the talk.
  return named >= 0 && named <= 40 && !/^[[(]/.test(words) && SUNG.test(words);
}

/** The print's own line saying the words are unedited, "בלתי מוגה" or "(הנחה בלתי מוגה)", among the first few. */
const MUGA_LINE = /^\(?(הנחה )?בלתי מוגה\)?\.?$/;

/** What the hisvaaduyos view finds in a farbrengen's words: each paragraph's place, its sections, and whether it is edited. */
export function hisvaaduyosParts(segments: readonly PageSegment[]): { classes: Map<string, string>; sections: FarbrengenSection[]; muga?: Muga } {
  const classes = new Map<string, string>();
  const sections: FarbrengenSection[] = [];
  let muga: Muga | undefined;
  segments.forEach((segment, at) => {
    const words = wordsOf(segment);
    if (at < 4 && segment.kind === 'heading' && /^בס"ד/.test(words)) {
      // The print's ב"ס"ד heading repeats the title (the occasion and the day), which the page shows itself.
      classes.set(segment.id, 'first');
      return;
    }
    if (at < 4 && !muga && MUGA_LINE.test(words)) {
      muga = words.includes('הנחה') ? 'hanacha' : 'bilti-mugah';
      classes.set(segment.id, 'hv-muga');
      return;
    }
    // Sections run א, ב, ג in order; a paragraph opening with other letters and a dot is not one.
    const letters = SECTION.exec(words)?.[1];
    if (letters && numberOf(letters) === sections.length + 1) sections.push({ label: letters, id: `s-${segment.id}` });
    if (isStage(segment)) classes.set(segment.id, 'stage');
  });
  return { classes, sections, ...(muga ? { muga } : {}) };
}

/** Words as two names are compared: letters and digits only. */
const keyOf = (text: string) => text.replace(/[^א-ת0-9]/g, '');

/**
 * What a Toras Menachem unit is by its name, and the occasion its name gives:
 * a maamar is named "<its ד"ה> · <occasion>", a sicha "שיחת <occasion>"
 * (Catalog's labels, #241). Anything else (a telegram, a רשימה) is neither.
 */
export function pieceOf(name: string): { kind: SaidThere['kind']; heading: string; occasion: string } | null {
  const plain = name.replace(/״/g, '"').replace(/׳/g, "'").trim();
  const dot = plain.indexOf(' · ');
  if (dot > 0) return { kind: 'maamar', heading: plain.slice(0, dot).trim(), occasion: plain.slice(dot + 3).trim() };
  const sicha = /^(מ?שיחת|שיחות)\s+(.+)$/.exec(plain);
  return sicha ? { kind: 'sichos', heading: '', occasion: sicha[2]!.trim() } : null;
}

/** Whether two names give the same occasion: one is the other's end ("יו"ד שבט ה'תשי"ד" said on "יום ה' פ' בשלח, יו"ד שבט ה'תשי"ד"). */
function sameOccasion(a: string, b: string): boolean {
  const [x, y] = [keyOf(a), keyOf(b)];
  if (Math.min(x.length, y.length) < 6) return false;
  return x.endsWith(y) || y.endsWith(x);
}

/** How far around a unit its farbrengen's other pieces are printed. */
const NEAR = 3;

/**
 * The other pieces said at a unit's farbrengen, from the names of the units
 * beside it (the path bar's last level, no other read): on a sicha's page the
 * maamar said there, on a maamar's page the sichos. RFC 0004 groups them by
 * `date` and `occasion`; until those labels are on every unit, by the occasion
 * their names give, which carries the year, among the units printed next to it.
 */
export function saidThere(here: { path?: string | null; name: string }, siblings: readonly { path?: string | null; name: string }[]): SaidThere[] {
  const own = pieceOf(here.name);
  if (!own) return [];
  const at = siblings.findIndex((s) => s.path === here.path);
  if (at < 0) return [];
  return siblings.slice(Math.max(0, at - NEAR), at + NEAR + 1).flatMap((sibling) => {
    const piece = sibling.path && sibling.path !== here.path ? pieceOf(sibling.name) : null;
    if (!piece || piece.kind === own.kind || !sameOccasion(piece.occasion, own.occasion)) return [];
    return [{ path: sibling.path!, label: piece.kind === 'maamar' ? `ד"ה ${piece.heading}` : sibling.name, kind: piece.kind }];
  });
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A maamar said at the farbrengen, as a card that opens its own page. Outside the paragraphs, so a fix never reaches it. */
const maamarCard = (maamar: SaidThere) =>
  `<a class="hv-said" href="${escape(maamar.path)}"><span><b>${escape(maamar.label)}</b><small>מאמר שנאמר בהתוועדות</small></span><span class="chip">פתיחה</span></a>`;

/**
 * A farbrengen's words as the hisvaaduyos view sets them: what happened
 * between the words in a quiet line, the print's ב"ס"ד heading and its
 * בלתי מוגה line left to the title and its chip, and the maamar said there
 * as a card where the words say it was said (the first stage line that names
 * a maamar), else before the words.
 */
export const hisvaaduyosLayout: WordsLayout = {
  classes: (segments) => hisvaaduyosParts(segments).classes,
  body: (segments, _item, draw, context: WordsContext) => {
    const maamarim = (context.said ?? []).filter((piece) => piece.kind === 'maamar');
    if (!maamarim.length) return draw(segments);
    const { classes } = hisvaaduyosParts(segments);
    const cards = maamarim.map(maamarCard).join('');
    const at = segments.findIndex((s) => classes.get(s.id) === 'stage' && wordsOf(s).includes('מאמר'));
    return at < 0 ? cards + draw(segments) : draw(segments.slice(0, at + 1)) + cards + draw(segments.slice(at + 1));
  },
};
