import { describe, expect, it } from 'vitest';
import { toMafteiachHebrewDateKey } from '../src/hebrewDateKey.js';

describe('toMafteiachHebrewDateKey', () => {
  it('converts Shevat (real: Yud Shevat 5711 -> "5711-05-10")', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 11, day: 10 })).toBe('5711-05-10');
  });

  it('converts a leap year\'s Adar I to "06A" (real: 5711 is leap, "5711-06A-01" exists)', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 12, day: 1 })).toBe('5711-06A-01');
  });

  it('converts a leap year\'s Adar II to "06B" (real: "5711-06B-07" exists)', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 13, day: 7 })).toBe('5711-06B-07');
  });

  it('converts a non-leap year\'s Adar to plain "06" (5712 is not a leap year)', () => {
    expect(toMafteiachHebrewDateKey({ year: 5712, month: 12, day: 1 })).toBe('5712-06-01');
  });

  it('converts Tishrei (native month 7) to "01"', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 7, day: 1 })).toBe('5711-01-01');
  });

  it('converts Nisan (native month 1) to "07"', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 1, day: 1 })).toBe('5711-07-01');
  });

  it('converts Elul (native month 6) to "12"', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 6, day: 1 })).toBe('5711-12-01');
  });

  it('zero-pads single-digit days', () => {
    expect(toMafteiachHebrewDateKey({ year: 5711, month: 11, day: 3 })).toBe('5711-05-03');
  });

  it('throws on an out-of-range month', () => {
    expect(() => toMafteiachHebrewDateKey({ year: 5711, month: 14, day: 1 })).toThrow(RangeError);
  });
});
