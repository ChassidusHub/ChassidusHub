/*
 * Word by word: when each word of a transcript's paragraph is heard, so the
 * recording page can light the word being said. No imports, so a plain test
 * can read it.
 */

/** A word as the transcript times it: its characters in the paragraph's text [from, to) and when it is heard (ms from its part's start). */
export interface TimedWord {
  from: number;
  to: number;
  startMs: number;
}

/** A paragraph's words, each with where it starts in the text. */
export function wordsOf(text: string): { word: string; at: number }[] {
  const words: { word: string; at: number }[] = [];
  for (const match of text.matchAll(/\S+/g)) words.push({ word: match[0], at: match.index! });
  return words;
}

/**
 * When each word of a paragraph is heard. The transcript's own times when it
 * has them (a word takes the time of the timed word it starts in); else the
 * paragraph's time is spread over its words by their length, which is close
 * enough to follow along with.
 */
export function wordTimes(text: string, start: number, end: number, timed?: TimedWord[] | null): number[] {
  const words = wordsOf(text);
  if (timed?.length) {
    let at = 0;
    return words.map((w) => {
      while (at + 1 < timed.length && timed[at + 1]!.from <= w.at) at++;
      return timed[at]!.from <= w.at || at === 0 ? timed[at]!.startMs : start;
    });
  }
  const length = Math.max(0, end - start);
  const total = words.reduce((sum, w) => sum + w.word.length + 1, 0) || 1;
  let before = 0;
  return words.map((w) => {
    const time = start + Math.round((before / total) * length);
    before += w.word.length + 1;
    return time;
  });
}

/** The word heard at `ms`: the last that starts by then, or -1 before the first. */
export function wordAt(times: number[], ms: number): number {
  let heard = -1;
  for (let index = 0; index < times.length && times[index]! <= ms; index++) heard = index;
  return heard;
}

/** The word that holds the character at `offset` (a tap's place in the text), or the last word before it. */
export function wordHolding(text: string, offset: number): number {
  let holding = 0;
  wordsOf(text).forEach((w, index) => {
    if (w.at <= offset) holding = index;
  });
  return holding;
}
