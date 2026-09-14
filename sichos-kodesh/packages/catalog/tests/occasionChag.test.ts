import { describe, expect, it } from 'vitest';
import { occasionChagCategory } from '../src/occasionChag.js';

describe('occasionChagCategory', () => {
  // All dates verified directly against a real HebrewCalendar.calendar(5711) scan.
  it('resolves Rosh Hashana (both days, including the year-suffixed first-day description)', () => {
    expect(occasionChagCategory('5711-01-01', false)).toBe('Rosh Hashana');
    expect(occasionChagCategory('5711-01-02', false)).toBe('Rosh Hashana');
  });

  it('resolves Yom Kippur', () => {
    expect(occasionChagCategory('5711-01-10', false)).toBe('Yom Kippur');
  });

  it('resolves Sukkot (both days), Shmini Atzeret, and Simchat Torah as distinct categories', () => {
    expect(occasionChagCategory('5711-01-15', false)).toBe('Sukkot');
    expect(occasionChagCategory('5711-01-16', false)).toBe('Sukkot');
    expect(occasionChagCategory('5711-01-22', false)).toBe('Shmini Atzeret');
    expect(occasionChagCategory('5711-01-23', false)).toBe('Simchat Torah');
  });

  it('resolves Pesach (first and last days)', () => {
    expect(occasionChagCategory('5711-07-15', false)).toBe('Pesach');
    expect(occasionChagCategory('5711-07-22', false)).toBe('Pesach');
  });

  it('resolves Shavuot', () => {
    expect(occasionChagCategory('5711-09-06', false)).toBe('Shavuot');
  });

  it('is null for a minor holiday that does not carry the CHAG flag (25 Kislev 5711 - Chanukah)', () => {
    expect(occasionChagCategory('5711-03-25', false)).toBeNull();
  });

  it('is null for Chol HaMoed (18 Tishrei 5711 - within Sukkot but not itself CHAG-flagged)', () => {
    expect(occasionChagCategory('5711-01-18', false)).toBeNull();
  });

  it('is null for an ordinary weekday with no holiday at all (10 Shevat 5711)', () => {
    expect(occasionChagCategory('5711-05-10', false)).toBeNull();
  });
});
