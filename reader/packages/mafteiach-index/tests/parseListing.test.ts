import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseListingPage } from '../src/parseListing.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name), 'utf8');

describe('parseListingPage', () => {
  const raw = fixture('by-year-5711.raw.js');
  const entries = parseListingPage(raw);

  it('parses every farbrengen entry in the year (real fixture: 66 in 5711)', () => {
    expect(entries.length).toBe(66);
  });

  it('extracts id, hebrewDate, isPreNesius and occasionLabel for a known entry', () => {
    const entry = entries.find((e) => e.id === 11112824);
    expect(entry).toEqual({
      id: 11112824,
      hebrewYear: 5711,
      hebrewDate: '5711-02-10',
      isPreNesius: false,
      occasionLabel: 'לך לך, יו"ד מ"ח',
    });
  });

  it('every entry has a well-formed hebrewDate key (YYYY-MM-DD, month optionally suffixed A/B for Adar I/II, optional trailing letter for a same-day second entry)', () => {
    for (const entry of entries) {
      expect(entry.hebrewDate).toMatch(/^\d{4}-\d{2}[AB]?-\d{2}[a-z]?$/);
      expect(entry.hebrewYear).toBe(5711);
    }
  });

  it('confirms the real Adar-split finding: 5711 (a leap year) uses 06A/06B for Adar I/II and keeps Nisan fixed at 07', () => {
    const months = new Set(entries.map((e) => e.hebrewDate.split('-')[1]));
    expect(months.has('06A')).toBe(true);
    expect(months.has('06B')).toBe(true);
    expect(months.has('06')).toBe(false);
    const nisanEntries = entries.filter((e) => e.hebrewDate.split('-')[1] === '07');
    expect(nisanEntries.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty occasion label', () => {
    for (const entry of entries) {
      expect(entry.occasionLabel.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique within a year', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseListingPage on the pre-Nesius combined bucket page', () => {
  const entries = parseListingPage(fixture('by-year-5690-5710-bucket.raw.js'));

  it('derives each entry\'s hebrewYear from its own hebrewDate rather than a single passed-in year, since the bucket spans 5690-5710', () => {
    const years = new Set(entries.map((e) => e.hebrewYear));
    expect(Math.min(...years)).toBeGreaterThanOrEqual(5690);
    expect(Math.max(...years)).toBe(5710);
    expect(years.size).toBeGreaterThan(1); // the whole point: this page is NOT single-year like the others
  });

  it('flags every entry as pre-Nesius', () => {
    expect(entries.every((e) => e.isPreNesius)).toBe(true);
  });

  it('tolerates a "00" day placeholder for undated early entries without crashing', () => {
    const undated = entries.filter((e) => e.hebrewDate.endsWith('-00'));
    expect(undated.length).toBeGreaterThan(0);
  });
});
