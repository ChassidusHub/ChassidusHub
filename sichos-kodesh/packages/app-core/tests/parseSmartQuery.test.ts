import { describe, expect, it } from 'vitest';
import { parseSmartQuery } from '../src/search/parseSmartQuery.js';

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

    it('detects a bare, unmarked one-letter token as a day when it sits next to a real month name', () => {
      const { detected, remainingText } = parseSmartQuery('י שבט', RANGE);
      expect(detected.day).toBe(10);
      expect(detected.hdateMonth).toBe(11);
      expect(remainingText).toBe('');
    });

    it('does not detect a bare, unmarked short token as a day when it is not next to a recognized month/parsha/chag - too ambiguous with an ordinary short word on its own', () => {
      const { detected, remainingText } = parseSmartQuery('י', RANGE);
      expect(detected.day).toBeNull();
      expect(remainingText).toBe('י');
    });

    it('detects "חי" (Chai, 18) as a day only next to a month, since on its own it is an ordinary word', () => {
      const withMonth = parseSmartQuery('חי אלול', RANGE);
      expect(withMonth.detected.day).toBe(18);
      expect(withMonth.detected.hdateMonth).toBe(6);

      const alone = parseSmartQuery('חי', RANGE);
      expect(alone.detected.day).toBeNull();
      expect(alone.remainingText).toBe('חי');
    });

    it('detects Chai Elul regardless of which quote-like mark is used for the gershayim, or none at all', () => {
      for (const q of ['חי אלול', 'ח"י אלול', "ח''י אלול", "ח'י אלול", 'ח״י אלול']) {
        const { detected } = parseSmartQuery(q, RANGE);
        expect(detected.day, q).toBe(18);
        expect(detected.hdateMonth, q).toBe(6);
      }
    });

    it('detects the spelled-out "גימל" (Gimmel, 3) form for Gimmel Tammuz, in Hebrew and English', () => {
      expect(parseSmartQuery('גימל תמוז', RANGE).detected.day).toBe(3);
      expect(parseSmartQuery('Gimmel Tammuz', RANGE).detected.day).toBe(3);
    });

    it('detects a further-abbreviated year (dropping the century too) only next to a recognized month, not as a standalone guess', () => {
      const withMonth = parseSmartQuery('י שבט לו', RANGE); // "לו" = 36 -> 5736, alongside day 10 + Shevat
      expect(withMonth.detected.day).toBe(10);
      expect(withMonth.detected.hdateMonth).toBe(11);
      expect(withMonth.detected.hebrewYear).toBe(5736);
      expect(withMonth.remainingText).toBe('');

      const alone = parseSmartQuery('לו', RANGE);
      expect(alone.detected.hebrewYear).toBeNull();
      expect(alone.remainingText).toBe('לו');
    });

    it('does not misread an ordinary word as an abbreviated year just because it sits near another ordinary word', () => {
      // "חב"ד" sums to 14 -> 5714, a real catalog year - but neither it nor
      // its neighbor "כפר" is a recognized month/parsha/chag, so it must
      // stay free text rather than being guessed as a year.
      const { detected, remainingText } = parseSmartQuery('כפר חב"ד', RANGE);
      expect(detected.hebrewYear).toBeNull();
      expect(remainingText).toBe('כפר חבד');
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

    it('keeps a word the English occasion names use as text, rather than a fuzzy parsha guess', () => {
      expect(parseSmartQuery('simchas torah', RANGE).detected.parsha).toBe('Korach');
      const literalWords = new Set(['simchas', 'torah', 'mincha']);
      const { detected, remainingText } = parseSmartQuery('simchas torah', RANGE, { literalWords });
      expect(detected.parsha).toBeNull();
      expect(remainingText).toBe('simchas torah');
      expect(parseSmartQuery('after mincha', RANGE, { literalWords }).detected.parsha).toBeNull();
    });

    it('still reads an exact month or parsha name as a filter, even when the English names use it too', () => {
      const literalWords = new Set(['tishrei', 'noach']);
      expect(parseSmartQuery('tishrei', RANGE, { literalWords }).detected.hdateMonth).toBe(7);
      expect(parseSmartQuery('noach', RANGE, { literalWords }).detected.parsha).toBe('Noach');
    });
  });
});
