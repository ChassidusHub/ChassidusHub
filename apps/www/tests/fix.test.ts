import { describe, expect, it } from 'vitest';
import type { PageInline } from '@chassidushub/model';
import { replaceInRuns, replaceInText, wordsDiffering } from '../app/fix/replace.js';

const labels = new Map([['n1', '1']]);
// Drawn as: "א. פסקה ובה מילה מודגשת והערה1." (the note's mark shows its label).
const runs: PageInline[] = [{ text: 'א.', marks: ['ois'] }, { text: ' פסקה ובה ' }, { text: 'מילה מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }];
const drawn = 'א. פסקה ובה מילה מודגשת והערה1.';

describe('a fix puts the typed words in place of the selected ones', () => {
  it('changes only the selected words, keeping the runs around them', () => {
    const at = drawn.indexOf('פסקה');
    expect(replaceInRuns(runs, labels, at, 'פסקה', 'הפסקה')).toEqual([{ text: 'א.', marks: ['ois'] }, { text: ' הפסקה ובה ' }, { text: 'מילה מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }]);
  });

  it('keeps a bold word bold', () => {
    const at = drawn.indexOf('מודגשת');
    expect(replaceInRuns(runs, labels, at, 'מודגשת', 'מודגש')).toContainEqual({ text: 'מילה מודגש', marks: ['b'] });
  });

  it('puts words across two runs into the first, with its marks', () => {
    const at = drawn.indexOf('ובה מילה');
    expect(replaceInRuns(runs, labels, at, 'ובה מילה', 'ובו מילה')).toEqual([{ text: 'א.', marks: ['ois'] }, { text: ' פסקה ובו מילה' }, { text: ' מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }]);
  });

  it('never takes in a footnote mark', () => {
    const at = drawn.indexOf('והערה1');
    expect(replaceInRuns(runs, labels, at, 'והערה1', 'והערה')).toBe('not-words');
  });

  it('finds the words when the place moved, if they are there only once', () => {
    expect(replaceInRuns(runs, labels, 0, 'פסקה', 'הפסקה')).toContainEqual({ text: ' הפסקה ובה ' });
    expect(replaceInRuns(runs, labels, 0, 'אין כאן', 'x')).toBe('moved');
  });

  it('does the same in a transcript paragraph', () => {
    expect(replaceInText('אמר הרבי כך וכך', 4, 'הרבי', 'הרבי שליט"א')).toBe('אמר הרבי שליט"א כך וכך');
    expect(replaceInText('כך וכך', 0, 'וכך', 'ועוד')).toBe('כך ועוד');
    expect(replaceInText('כך וכך כך', 9, 'כך', 'x')).toBe('moved');
  });
});

describe('counting the words a fix changes', () => {
  it('counts what differs between the shared start and end', () => {
    expect(wordsDiffering('אחת שתים שלש', 'אחת שתיים שלש')).toBe(1);
    expect(wordsDiffering('אחת', 'אחת שתים שלש ארבע חמש שש שבע')).toBe(6);
    expect(wordsDiffering('אחת שתים', 'אחת שתים')).toBe(0);
  });
});
