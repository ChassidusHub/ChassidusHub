import { describe, expect, it } from 'vitest';
import { cleanName, nameJunk } from '../src/index.js';

/** Folder numbers and contact details in names (#125); the made-up names stand for what a source's folders carry. */
describe('junk in names', () => {
  it('finds a folder number in front, a phone number and an email', () => {
    expect(nameJunk('יד.1. Sichos Mugeh in English (1951-1978)')).toEqual(['folder-number']);
    expect(nameJunk('Tanya with nikud - 347-426-8187')).toEqual(['phone']);
    expect(nameJunk('12. בראשית')).toEqual(['folder-number']);
    expect(nameJunk('3) ביאור, info@example.org')).toEqual(['folder-number', 'email']);
    expect(nameJunk('call (347) 426 8187 or +972 2 123 4567')).toEqual(['phone']);
  });

  it('leaves names that only have numbers in them', () => {
    for (const name of ['לקוטי שיחות חלק 12', 'ספר המאמרים 5711', 'Sichos in English (1951-1978)', '05 בראשית', 'תורת מנחם תשמ"ב', 'שיחות קודש 1.2']) {
      expect(nameJunk(name)).toEqual([]);
      expect(cleanName(name)).toBe(name);
    }
  });

  it('drops the junk and the dash before it', () => {
    expect(cleanName('יד.1. Sichos Mugeh in English (1951-1978)')).toBe('Sichos Mugeh in English (1951-1978)');
    expect(cleanName('Tanya with nikud - 347-426-8187')).toBe('Tanya with nikud');
    expect(cleanName('3) ביאור, info@example.org')).toBe('ביאור');
    // Nothing left: the name stays as it was.
    expect(cleanName('347-426-8187')).toBe('347-426-8187');
  });
});
