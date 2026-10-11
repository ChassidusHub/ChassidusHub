import { describe, expect, it } from 'vitest';
import { wordAt, wordHolding, wordTimes, wordsOf } from '../app/listen/timing.js';

describe('word by word', () => {
  const text = 'אחת שתיים  שלוש';

  it('finds the words and where each starts', () => {
    expect(wordsOf(text)).toEqual([
      { word: 'אחת', at: 0 },
      { word: 'שתיים', at: 4 },
      { word: 'שלוש', at: 11 },
    ]);
  });

  it('takes the transcript’s own word times', () => {
    const timed = [
      { from: 0, to: 3, startMs: 100 },
      { from: 4, to: 9, startMs: 900 },
      { from: 11, to: 15, startMs: 2000 },
    ];
    expect(wordTimes(text, 0, 3000, timed)).toEqual([100, 900, 2000]);
  });

  it('spreads a paragraph’s time over its words by their length when it has no word times', () => {
    const times = wordTimes(text, 1000, 2600);
    expect(times[0]).toBe(1000);
    expect(times[1]).toBeGreaterThan(times[0]!);
    expect(times[2]).toBeGreaterThan(times[1]!);
    expect(times[2]).toBeLessThan(2600);
  });

  it('knows the word being said, and none before the first', () => {
    expect(wordAt([100, 900, 2000], 50)).toBe(-1);
    expect(wordAt([100, 900, 2000], 900)).toBe(1);
    expect(wordAt([100, 900, 2000], 5000)).toBe(2);
  });

  it('knows the word a tap landed in', () => {
    expect(wordHolding(text, 0)).toBe(0);
    expect(wordHolding(text, 6)).toBe(1);
    expect(wordHolding(text, 10)).toBe(1);
    expect(wordHolding(text, 14)).toBe(2);
  });
});
