import { describe, expect, it } from 'vitest';
import { occasionSpecialDay } from '../src/specialDays.js';

describe('occasionSpecialDay', () => {
  it('matches an occasion falling exactly on a special day (Yud Shevat, 5711-05-10)', () => {
    expect(occasionSpecialDay('5711-05-10', 'יו"ד שבט')).toBe('11-10');
  });

  it('matches an "ערב" (eve of) occasion the day before a special day, even though its own date is not itself listed', () => {
    // Lag BaOmer is Iyar 18 (mafteiach token 08); Iyar 17 is not itself a special day.
    expect(occasionSpecialDay('5711-08-17', 'ערב ל"ג בעומר')).toBe('2-18');
  });

  it('matches a "מוצאי" (conclusion of) occasion the day after a special day', () => {
    expect(occasionSpecialDay('5711-08-19', 'מוצאי ל"ג בעומר')).toBe('2-18');
  });

  it('does not match an unrelated occasion on the same adjacent date without an erev/motzoei label - proximity alone is not enough', () => {
    expect(occasionSpecialDay('5711-08-19', 'שיחה לקבוצת סטודנטים')).toBeNull();
  });

  it('does not match an ordinary date with no special day nearby at all', () => {
    expect(occasionSpecialDay('5711-09-01', 'שיחה')).toBeNull();
  });

  it('treats Purim in a leap year (Adar II) as a distinct special day from regular-Adar Purim', () => {
    // 5712 is not a leap year; Adar (token "06") day 14 is Purim.
    expect(occasionSpecialDay('5712-06-14', 'פורים')).toBe('12-14');
  });
});
