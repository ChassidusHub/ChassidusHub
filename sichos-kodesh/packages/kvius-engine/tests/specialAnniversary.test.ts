import { describe, expect, it } from 'vitest';
import { SPECIAL_ANNIVERSARY_YEARS, specialAnniversaryNumber } from '../src/specialAnniversary.js';

describe('specialAnniversaryNumber', () => {
  it('returns the round number when the gap matches one exactly', () => {
    for (const n of SPECIAL_ANNIVERSARY_YEARS) {
      expect(specialAnniversaryNumber(5786, 5786 - n)).toBe(n);
    }
  });

  it('is null for a gap not on the curated list, even an ordinary round decade', () => {
    expect(specialAnniversaryNumber(5786, 5786 - 45)).toBeNull(); // 45 isn't curated (75 is, 45/55/65/85/95 aren't)
    expect(specialAnniversaryNumber(5786, 5786 - 10)).toBeNull();
    expect(specialAnniversaryNumber(5786, 5786 - 30)).toBeNull();
  });

  it('is null for the target year itself (0 gap) and for a future candidate (negative gap)', () => {
    expect(specialAnniversaryNumber(5786, 5786)).toBeNull();
    expect(specialAnniversaryNumber(5786, 5800)).toBeNull();
  });
});
