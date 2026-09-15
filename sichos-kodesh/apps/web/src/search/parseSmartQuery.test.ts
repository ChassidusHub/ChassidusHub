import { describe, expect, it } from 'vitest';
import { parseSmartQuery } from './parseSmartQuery';

const RANGE = { min: 5710, max: 5752 };

describe('parseSmartQuery', () => {
  it('detects a plain 4-digit year within the catalog range', () => {
    const { detected, remainingText } = parseSmartQuery('5736', RANGE);
    expect(detected.hebrewYear).toBe(5736);
    expect(remainingText).toBe('');
  });

  it('ignores a 4-digit number outside the catalog range', () => {
    const { detected, remainingText } = parseSmartQuery('1999', RANGE);
    expect(detected.hebrewYear).toBeNull();
    expect(remainingText).toBe('1999');
  });

  it('detects a gematriya year written with a geresh/gershayim mark', () => {
    const { detected, remainingText } = parseSmartQuery('תשל״ו', RANGE);
    expect(detected.hebrewYear).toBe(5736);
    expect(remainingText).toBe('');
  });

  it('detects a gematriya year written with no geresh/gershayim mark at all', () => {
    const { detected, remainingText } = parseSmartQuery('תשלה', RANGE);
    expect(detected.hebrewYear).toBe(5735);
    expect(remainingText).toBe('');
  });

  it('detects year + month together with no punctuation, exactly the reported failing query', () => {
    const { detected } = parseSmartQuery('חי אלול תשלה', RANGE);
    expect(detected.hebrewYear).toBe(5735);
    expect(detected.hdateMonth).toBe(6); // Elul
  });

  it('does not misread an ordinary Hebrew word as a year just because its letters happen to be short', () => {
    const { detected, remainingText } = parseSmartQuery('בשלח', RANGE);
    expect(detected.hebrewYear).toBeNull();
    // Beshalach is also a real parsha name, so it's consumed as that - not left as free text.
    expect(detected.parsha).toBe('Beshalach');
    expect(remainingText).toBe('');
  });

  it('detects an English month name', () => {
    const { detected, remainingText } = parseSmartQuery('Kislev', RANGE);
    expect(detected.hdateMonth).toBe(9);
    expect(remainingText).toBe('');
  });

  it('detects a Hebrew month name', () => {
    const { detected, remainingText } = parseSmartQuery('כסלו', RANGE);
    expect(detected.hdateMonth).toBe(9);
    expect(remainingText).toBe('');
  });

  it('detects an English parsha name', () => {
    const { detected } = parseSmartQuery('Beshalach', RANGE);
    expect(detected.parsha).toBe('Beshalach');
  });

  it('detects a multi-word chag name over its own shorter substring', () => {
    const { detected, remainingText } = parseSmartQuery('Chol HaMoed Sukkot', RANGE);
    expect(detected.parsha).toBe('Chol HaMoed Sukkot');
    expect(remainingText).toBe('');
  });

  it('detects a single-word chag name on its own', () => {
    const { detected } = parseSmartQuery('Sukkot', RANGE);
    expect(detected.parsha).toBe('Sukkot');
  });

  it('detects a Hebrew multi-word chag name', () => {
    const { detected } = parseSmartQuery('חול המועד סוכות', RANGE);
    expect(detected.parsha).toBe('Chol HaMoed Sukkot');
  });

  it('combines several signals in any order, leaving real free text behind', () => {
    const a = parseSmartQuery('תשל״ו בשלח', RANGE);
    expect(a.detected.hebrewYear).toBe(5736);
    expect(a.detected.parsha).toBe('Beshalach');
    expect(a.remainingText).toBe('');

    const b = parseSmartQuery('בשלח תשל״ו', RANGE);
    expect(b.detected.hebrewYear).toBe(5736);
    expect(b.detected.parsha).toBe('Beshalach');
    expect(b.remainingText).toBe('');
  });

  it('leaves ordinary free text alone when nothing structured is detected', () => {
    const { detected, remainingText } = parseSmartQuery('כפר חב״ד', RANGE);
    expect(detected.hebrewYear).toBeNull();
    expect(detected.hdateMonth).toBeNull();
    expect(detected.parsha).toBeNull();
    expect(remainingText).toBe('כפר חבד');
  });

  it('returns everything empty for an empty query', () => {
    const { detected, remainingText } = parseSmartQuery('', RANGE);
    expect(detected).toEqual({ hebrewYear: null, hdateMonth: null, day: null, parsha: null });
    expect(remainingText).toBe('');
  });

  describe('day-of-month detection', () => {
    it('detects a plain 1-2 digit number as a day', () => {
      const { detected, remainingText } = parseSmartQuery('10 Shevat', RANGE);
      expect(detected.day).toBe(10);
      expect(detected.hdateMonth).toBe(11);
      expect(remainingText).toBe('');
    });

    it('detects a compact Hebrew numeral with a geresh mark', () => {
      const { detected } = parseSmartQuery("י' שבט", RANGE);
      expect(detected.day).toBe(10);
    });

    it('detects a compact two-letter Hebrew numeral with gershayim', () => {
      const { detected } = parseSmartQuery('כ"ד שבט', RANGE);
      expect(detected.day).toBe(24);
    });

    it('does not detect a bare, unmarked one-letter token as a day - too ambiguous with an ordinary short word', () => {
      const { detected, remainingText } = parseSmartQuery('י שבט', RANGE);
      expect(detected.day).toBeNull();
      expect(remainingText).toBe('י');
    });

    it('detects the spelled-out "יוד" (Yud) form for the 10th, in Hebrew and English, even with no geresh at all', () => {
      expect(parseSmartQuery('יוד שבט', RANGE).detected.day).toBe(10);
      expect(parseSmartQuery('Yud Shevat', RANGE).detected.day).toBe(10);
    });

    it('detects day + month + year together in the exact reported failing query', () => {
      const { detected, remainingText } = parseSmartQuery('יוד שבט תשלו', RANGE);
      expect(detected.day).toBe(10);
      expect(detected.hdateMonth).toBe(11);
      expect(detected.hebrewYear).toBe(5736);
      expect(remainingText).toBe('');
    });
  });

  describe('typo-tolerant phrase matching', () => {
    it('tolerates a one-letter substitution in a month name', () => {
      const { detected, remainingText } = parseSmartQuery('כסלה', RANGE); // Kislev (כסלו) with its last letter wrong
      expect(detected.hdateMonth).toBe(9);
      expect(remainingText).toBe('');
    });

    it('corrects a mistyped parsha name missing one letter', () => {
      const { detected } = parseSmartQuery('בשלך', RANGE); // Beshalach with a ך instead of ח
      expect(detected.parsha).toBe('Beshalach');
    });

    it('does not guess between two different real months equally close to the same typo, leaving it as free text instead', () => {
      // "שבת" (Shabbos) is one substitution away from both שבט (Shevat)
      // and טבת (Tevet) - guessing either would silently show the wrong
      // month's occasions, so neither should be applied.
      const { detected, remainingText } = parseSmartQuery('שבת', RANGE);
      expect(detected.hdateMonth).toBeNull();
      expect(remainingText).toBe('שבת');
    });

    it('still resolves correctly when a genuinely ambiguous month typo is combined with other structured signals', () => {
      const { detected } = parseSmartQuery('יוד שבת תשלו', RANGE);
      expect(detected.day).toBe(10);
      expect(detected.hebrewYear).toBe(5736);
      expect(detected.hdateMonth).toBeNull();
    });
  });
});
