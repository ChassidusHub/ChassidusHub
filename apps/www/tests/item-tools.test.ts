import { describe, expect, it } from 'vitest';
import { between, fieldOf, plainText, sizeOf, wordDiff, type Version } from '../app/tools/common.js';

describe('two texts are compared word by word', () => {
  it('marks the one word that changed and keeps the rest', () => {
    expect(wordDiff('פסקה ראשונה לדוגמא ובה מילה', 'פסקה ראשונה לדוגמה ובה מילה')).toEqual([
      { kind: 'same', text: 'פסקה ראשונה ' },
      { kind: 'del', text: 'לדוגמא ' },
      { kind: 'ins', text: 'לדוגמה ' },
      { kind: 'same', text: 'ובה מילה' },
    ]);
  });

  it('reads back as each text, give or take a space at the end', () => {
    const before = 'א ב ג ד ה';
    const after = 'א ג ד ו ה ז';
    const pieces = wordDiff(before, after);
    expect(pieces.filter((p) => p.kind !== 'ins').map((p) => p.text).join('').trim()).toBe(before);
    expect(pieces.filter((p) => p.kind !== 'del').map((p) => p.text).join('').trim()).toBe(after);
  });

  it('says a new or a removed value whole', () => {
    expect(wordDiff('', 'שם חדש')).toEqual([{ kind: 'ins', text: 'שם חדש' }]);
    expect(wordDiff('שם ישן', '')).toEqual([{ kind: 'del', text: 'שם ישן' }]);
  });
});

describe("a version's changes are said in words", () => {
  it('reads runs of a page, names, and plain values', () => {
    expect(plainText([{ text: 'פסקה ' }, { note: 'n1' }, { text: 'לדוגמה', marks: ['b'] }])).toBe('פסקה לדוגמה');
    expect(plainText({ he: 'שם', en: 'Name' })).toBe('שם');
    expect(plainText(5747)).toBe('5747');
    expect(plainText(undefined)).toBe('');
  });

  it('names the field a change is in', () => {
    expect(fieldOf('/label/he')).toBe('השם');
    expect(fieldOf('/body/segments/p1/text')).toBe('המילים');
    expect(fieldOf('/date')).toBe('התאריך');
    expect(fieldOf('/kind')).toBe('kind');
  });

  it('says a size as people read it', () => {
    expect(sizeOf(1_468_006)).toBe('1.4 MB');
    expect(sizeOf(512)).toBe('512 B');
  });
});

const version = (rev: number, changes: Version['changes'], extra: Partial<Version> = {}): Version => ({
  commit: rev,
  at: `2026-10-0${rev}T10:00:00Z`,
  message: '',
  mergedBy: 'u',
  mergedByName: null,
  author: 'u',
  authorName: null,
  authorIsBot: false,
  rev,
  deleted: false,
  created: false,
  changes,
  ...extra,
});

describe('two versions compared', () => {
  // Newest first, as the API gives them.
  const history = [
    version(4, [{ path: '/label/he', before: 'ב', after: 'ג' }]),
    version(3, [{ path: '/date', before: '5747-01-01', after: '5747-01-02' }]),
    version(2, [{ path: '/label/he', before: 'א', after: 'ב' }]),
    version(1, [], { created: true }),
  ];

  it('takes each field from before the first change to after the last', () => {
    expect(between(history, 2, 4)).toEqual([
      { path: '/date', before: '5747-01-01', after: '5747-01-02' },
      { path: '/label/he', before: 'ב', after: 'ג' },
    ]);
  });

  it('cannot compare across the version the item was made in', () => {
    expect(between([version(2, [{ path: '/label/he', before: 'א', after: 'ב' }]), version(1, [], { deleted: true }), version(0, [])], 0, 2)).toBeNull();
  });

  it('cannot compare when one change holds another field inside it', () => {
    const nested = [version(3, [{ path: '/label/he', before: 'א', after: 'ב' }]), version(2, [{ path: '/label', before: { he: 'ת' }, after: { he: 'א' } }]), version(1, [])];
    expect(between(nested, 1, 3)).toBeNull();
  });
});
