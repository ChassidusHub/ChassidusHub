import { describe, expect, it } from 'vitest';
import { currentParsha } from '../src/currentParsha.js';

describe('currentParsha', () => {
  it('returns the upcoming Shabbos\'s parsha for a weekday (verified: Wed 2026-09-16 -> Shabbos Ha\'azinu on 2026-09-19)', () => {
    expect(currentParsha(false, new Date('2026-09-16'))).toEqual({ parsha: ["Ha'azinu"], gregorianDate: '2026-09-19' });
  });

  it("returns today's own parsha when today is itself the Shabbos (2026-09-19)", () => {
    expect(currentParsha(false, new Date('2026-09-19'))).toEqual({ parsha: ["Ha'azinu"], gregorianDate: '2026-09-19' });
  });

  it('returns parsha: null when the upcoming Shabbos is a chag (verified: Wed 2026-09-30 -> Shmini Atzeret Shabbos on 2026-10-03)', () => {
    expect(currentParsha(false, new Date('2026-09-30'))).toEqual({ parsha: null, gregorianDate: '2026-10-03' });
  });
});
