import type { PageSegment } from '@chassidushub/model';
import type { WordsLayout } from '../reader/words.server';

/** The part of a letter's head or foot a paragraph is, or its body (`layoutLetter`). */
export type LetterRole = 'dateline' | 'place' | 'addressee' | 'greeting' | 'body' | 'signature';

/** A letter's greeting: a short line of its own, שלום וברכה!, ברכה ושלום, or the English letters' Greeting and Blessing. */
const GREETING = /^(שלום|שלו׳|שלו'|ברכה|ש"ו|שו"ב|שו״ב|greeting|sholom|shalom)/i;
const GREETING_MAX = 32;

/** A segment's words, without vowel points, to tell a greeting by. */
const wordsOf = (segment: PageSegment) =>
  (segment.text ?? [])
    .map((inline) => ('text' in inline ? inline.text : ''))
    .join('')
    .replace(/[֑-ׇ]/g, '')
    .trim();

/**
 * A letter laid out as the printed volumes set it, and as app.chassidushub.org
 * sets it (Sichos-Kodesh packages/app-core/src/seforim/textObject.ts,
 * `layoutLetter`, ported line for line): the date line (ב"ה, the date) at the
 * start side; the city under it, indented; the addressee in a block indented
 * further; the greeting back at the start side; the body's paragraphs with
 * their first lines indented; the signature at the end side.
 *
 * The date line, city and signature come marked for the end side (`end`, from
 * igros-index) and are given their places here by role; the addressee and the
 * greeting are found by their place: what stands between the city and a short
 * greeting line among the first few paragraphs. A letter with no such greeting
 * keeps its other paragraphs as body. Only the words are read, so a letter the
 * catalog knows nothing more about is still set as a letter.
 */
export function layoutLetter(segments: readonly PageSegment[]): Map<string, LetterRole> {
  const roles = new Map<string, LetterRole>();
  let first = 0;
  while (first < segments.length && segments[first]!.end) {
    roles.set(segments[first]!.id, first === 0 ? 'dateline' : 'place');
    first++;
  }
  let last = segments.length - 1;
  while (last >= first && segments[last]!.end) {
    roles.set(segments[last]!.id, 'signature');
    last--;
  }
  let body = first;
  for (let i = first; i <= Math.min(last, first + 3); i++) {
    const segment = segments[i]!;
    const words = wordsOf(segment);
    if (segment.kind !== 'paragraph' || words.length > GREETING_MAX || !GREETING.test(words)) continue;
    roles.set(segment.id, 'greeting');
    for (let a = first; a < i; a++) roles.set(segments[a]!.id, 'addressee');
    body = i + 1;
    break;
  }
  for (let i = body; i <= last; i++) if (segments[i]!.kind === 'paragraph') roles.set(segments[i]!.id, 'body');
  return roles;
}

/** A letter's words as the server draws them: each paragraph's place as its class (`l-dateline`, `l-body`), the notes on the whole letter unnumbered. */
export const letterLayout: WordsLayout = {
  classes: (segments) => new Map([...layoutLetter(segments)].map(([id, role]) => [id, `l-${role}`])),
  unmarkedNotes: true,
};
