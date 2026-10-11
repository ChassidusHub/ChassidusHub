import { describe, expect, it } from 'vitest';
import { compare, plainOf, trimmed, wordsOf } from '../app/back/words.js';

describe('the back room: what a change did to the words', () => {
  it('reads text, runs and a paragraph as plain words', () => {
    expect(plainOf('מילים')).toBe('מילים');
    expect(plainOf([{ text: 'א.', marks: ['ois'] }, { note: 'n1' }, { text: ' פסקה' }])).toBe('א. פסקה');
    expect(plainOf({ id: 'p1', text: [{ text: 'פסקה' }] })).toBe('פסקה');
    expect(plainOf(5)).toBeNull();
    expect(plainOf([{ note: 'n1' }])).toBeNull();
  });

  it('marks the words taken out and put in, and keeps the rest', () => {
    expect(compare('פסקה ראשונה לדוגמה', 'פסקה ראשונה לדוגמא')).toEqual([
      { kind: 'same', text: 'פסקה ראשונה ' },
      { kind: 'gone', text: 'לדוגמה' },
      { kind: 'new', text: 'לדוגמא' },
    ]);
    expect(compare('א ב ג', 'א ב ג ד')).toEqual([
      { kind: 'same', text: 'א ב ג' },
      { kind: 'new', text: ' ד' },
    ]);
  });

  it('keeps only a few words around the change', () => {
    const long = Array.from({ length: 40 }, (_, i) => `מ${i}`).join(' ');
    const [head] = trimmed(compare(`${long} ישן`, `${long} חדש`), 3);
    expect(head!.text.startsWith('… ')).toBe(true);
    expect(head!.text.split(' ').length).toBeLessThan(10);
  });

  it('says only that a field changed when it is not words', () => {
    expect(wordsOf([{ path: '/date', before: '5711-11-10', after: '5711-11-11' }])).toEqual([{ kind: 'words', pieces: [{ kind: 'gone', text: '5711-11-10' }, { kind: 'new', text: '5711-11-11' }] }]);
    expect(wordsOf([{ path: '/order', before: 1, after: 2 }])).toEqual([{ kind: 'field', path: '/order' }]);
  });
});
