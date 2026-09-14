import { describe, expect, it } from 'vitest';
import { isChagOccasion } from '../src/occasionChag.js';

describe('isChagOccasion', () => {
  it('is true for a real Yom Tov day (15 Tishrei 5711 - Sukkos I)', () => {
    expect(isChagOccasion('5711-01-15', false)).toBe(true);
  });

  it('is false for a minor holiday that does not carry the CHAG flag (25 Kislev 5711 - Chanukah)', () => {
    expect(isChagOccasion('5711-03-25', false)).toBe(false);
  });

  it('is false for an ordinary weekday with no holiday at all (10 Shevat 5711)', () => {
    expect(isChagOccasion('5711-05-10', false)).toBe(false);
  });
});
