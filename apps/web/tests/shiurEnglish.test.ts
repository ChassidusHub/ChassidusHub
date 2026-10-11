import { describe, expect, it } from 'vitest';
import { chumashEnglish, rambamEnglish, tehillimEnglish } from '../app/lib/shiurEnglish.js';

/** The day's shiurim in English, from Sefaria's references (#122). */
describe('the day’s shiurim in English', () => {
  it('names the Chumash by its verses, with Rashi', () => {
    expect(chumashEnglish('Genesis 6:9-22')).toBe('Genesis 6:9–22, with Rashi');
    expect(chumashEnglish(null)).toBeNull();
  });

  it('names the Tehillim by its psalms', () => {
    expect(tehillimEnglish(['Psalms 145-150'])).toBe('Psalms 145–150');
    expect(tehillimEnglish(['Psalms 1-8', null])).toBe('Psalms 1–8');
    expect(tehillimEnglish([])).toBeNull();
  });

  it('names the Rambam by section and chapters', () => {
    expect(rambamEnglish(['Mishneh Torah, Robbery and Lost Property 4', 'Mishneh Torah, Robbery and Lost Property 5', 'Mishneh Torah, Robbery and Lost Property 6'])).toBe('Robbery and Lost Property, chapters 4–6');
    expect(rambamEnglish(['Mishneh Torah, Levirate Marriage and Release 7'])).toBe('Levirate Marriage and Release, chapter 7');
    expect(rambamEnglish(['Mishneh Torah, Theft 9', 'Mishneh Torah, Robbery and Lost Property 1'])).toBe('Theft, chapter 9; Robbery and Lost Property, chapter 1');
  });

  it('names Sefer HaMitzvos by its commandments', () => {
    expect(rambamEnglish(['Sefer HaMitzvot, Negative Commandments 247'])).toBe('Negative commandment 247');
    expect(rambamEnglish(['Sefer HaMitzvot, Positive Commandments 1', 'Sefer HaMitzvot, Positive Commandments 2'])).toBe('Positive commandments 1, 2');
  });

  it('gives nothing for a reference it does not read, so the Hebrew stays', () => {
    expect(rambamEnglish(['Introduction'])).toBeNull();
    expect(rambamEnglish([])).toBeNull();
  });
});

describe('a month as a name', () => {
  it('is in English on the English page when it is only a Hebrew month', async () => {
    const { nameOf } = await import('../app/lib/i18n.js');
    expect(nameOf({ he: '<h2>כסלו</h2>' }, 'en')).toBe('Kislev');
    expect(nameOf({ he: 'אדר א' }, 'en')).toBe('Adar I');
    expect(nameOf({ he: 'כסלו' }, 'he')).toBe('כסלו');
    expect(nameOf({ he: 'בראשית' }, 'en')).toBe('בראשית');
    expect(nameOf({ he: 'כסלו', en: 'Kislev 5703' }, 'en')).toBe('Kislev 5703');
  });
});
