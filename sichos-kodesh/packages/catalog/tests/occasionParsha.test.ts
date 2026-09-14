import { describe, expect, it } from 'vitest';
import { occasionParsha } from '../src/occasionParsha.js';

describe('occasionParsha', () => {
  it("rolls a weekday occasion forward to its own week's Shabbos (Yud Shevat 5711 -> Parshas Beshalach)", () => {
    expect(occasionParsha('5711-05-10', false)).toEqual(['Beshalach']);
  });

  it('resolves an occasion that is itself on Shabbos to its own parsha', () => {
    // The Shabbos found above for Yud Shevat 5711 falls on 13 Shevat itself.
    expect(occasionParsha('5711-05-13', false)).toEqual(['Beshalach']);
  });

  it('returns null when the occasion falls in a chag week with no weekly reading', () => {
    // 15 Tishrei 5711 - Sukkos, verified against the real Sedra lookup.
    expect(occasionParsha('5711-01-15', false)).toBeNull();
  });
});
