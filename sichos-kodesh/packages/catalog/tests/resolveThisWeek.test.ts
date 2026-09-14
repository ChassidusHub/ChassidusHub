import { HDate } from '@hebcal/core';
import { findMatchingYears } from '@sichos-kodesh/kvius-engine';
import { describe, expect, it } from 'vitest';
import { toMafteiachHebrewDateKey } from '../src/hebrewDateKey.js';
import type { CatalogByYear } from '../src/catalogLookup.js';
import { resolveThisWeek, resolveThisWeekAllYears } from '../src/resolveThisWeek.js';
import type { CatalogEntry } from '../src/types.js';

function makeEntry(hebrewYear: number, hebrewDate: string, label: string, hasAudio: boolean): CatalogEntry {
  return {
    occasionId: hebrewYear * 1000 + hebrewDate.length,
    hebrewYear,
    hebrewDate,
    occasionLabel: label,
    audio: hasAudio ? [{ workerFilename: 'x.mp3', durationMs: 1000 }] : [],
    pdfs: [],
  };
}

describe('resolveThisWeek', () => {
  it("resolves this week's Shabbos occasion to the source year's matching date", () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;

    // A real Shabbos in targetYear - translate to sourceYear the same way the engine does.
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6); // some Shabbos on/after 15 Tishrei
    const sourceKey = toMafteiachHebrewDateKey({ year: sourceYear, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });

    const catalog: CatalogByYear = { [sourceYear]: [makeEntry(sourceYear, sourceKey, 'Shabbos', true)] };
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const result = resolveThisWeek(sourceYear, catalog, today);

    expect(result).toHaveLength(1);
    expect(result[0]!.entry.occasionLabel).toBe('Shabbos');
    expect(result[0]!.entry.audio).toHaveLength(1);
  });

  it('returns an empty array (no crash) when nothing in the source year has content this week', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const today = new Date(`${new HDate(15, 7, targetYear).greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const result = resolveThisWeek(sourceYear, {}, today);

    expect(result).toEqual([]);
  });

  it('includes a weekday occasion (e.g. Yud Shevat) alongside the same week\'s Shabbos, not Shabbos alone', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;

    // Yud Shevat in targetYear, and whichever Shabbos falls in the same Sun-Sat week.
    const targetYudShevat = new HDate(10, 11, targetYear);
    const weekEnd = targetYudShevat.onOrAfter(6);
    const weekStart = new HDate(weekEnd.abs() - 6);

    const yudShevatKey = toMafteiachHebrewDateKey({ year: sourceYear, month: targetYudShevat.getMonth(), day: targetYudShevat.getDate() });
    const shabbosKey = toMafteiachHebrewDateKey({ year: sourceYear, month: weekEnd.getMonth(), day: weekEnd.getDate() });

    const catalog: CatalogByYear = {
      [sourceYear]: [makeEntry(sourceYear, yudShevatKey, 'Yud Shevat', true), makeEntry(sourceYear, shabbosKey, 'Shabbos', true)],
    };
    // Land "today" mid-week, after Yud Shevat's weekday but before that week's Shabbos, so both are still in-window.
    const today = new Date(`${weekStart.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const result = resolveThisWeek(sourceYear, catalog, today);

    const labels = result.map((r) => r.entry.occasionLabel).sort();
    expect(labels).toEqual(['Shabbos', 'Yud Shevat'].sort());
  });

  it('omits an occasion with neither audio nor a PDF (a real gap, not shown as content)', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6);
    const sourceKey = toMafteiachHebrewDateKey({ year: sourceYear, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });

    const catalog: CatalogByYear = { [sourceYear]: [makeEntry(sourceYear, sourceKey, 'Shabbos', false)] };
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    expect(resolveThisWeek(sourceYear, catalog, today)).toEqual([]);
  });

  it('returns occasions in day order across the week', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;

    const weekEnd = new HDate(15, 7, targetYear).onOrAfter(6);
    const weekStart = new HDate(weekEnd.abs() - 6);
    const midWeek = new HDate(weekStart.abs() + 2);

    const startKey = toMafteiachHebrewDateKey({ year: sourceYear, month: weekStart.getMonth(), day: weekStart.getDate() });
    const midKey = toMafteiachHebrewDateKey({ year: sourceYear, month: midWeek.getMonth(), day: midWeek.getDate() });
    const endKey = toMafteiachHebrewDateKey({ year: sourceYear, month: weekEnd.getMonth(), day: weekEnd.getDate() });

    const catalog: CatalogByYear = {
      [sourceYear]: [
        makeEntry(sourceYear, endKey, 'end', true),
        makeEntry(sourceYear, startKey, 'start', true),
        makeEntry(sourceYear, midKey, 'mid', true),
      ],
    };
    const today = new Date(`${weekStart.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const result = resolveThisWeek(sourceYear, catalog, today);
    expect(result.map((r) => r.entry.occasionLabel)).toEqual(['start', 'mid', 'end']);
  });

  it('excludes days that roll into the next Hebrew year, rather than misattributing sourceYear\'s own unrelated same-month-day date', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;

    const nextRoshHashanaAbs = new HDate(1, 7, targetYear + 1).abs();
    const erevRoshHashana = new HDate(nextRoshHashanaAbs - 1); // Never Shabbos - Rosh Hashana can't fall on Sunday.
    const today = new Date(`${erevRoshHashana.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const erevKey = toMafteiachHebrewDateKey({ year: sourceYear, month: erevRoshHashana.getMonth(), day: erevRoshHashana.getDate() });
    // sourceYear's own Rosh Hashana (Tishrei 1) - a real, unrelated date a full year earlier in sourceYear's own
    // calendar. A naive month/day translation of the new Hebrew year's Rosh Hashana (which falls in this same
    // Sun-Sat week) would wrongly land on this exact key.
    const sourceOwnRoshHashanaKey = toMafteiachHebrewDateKey({ year: sourceYear, month: 7, day: 1 });

    const catalog: CatalogByYear = {
      [sourceYear]: [
        makeEntry(sourceYear, erevKey, 'Erev Rosh Hashana', true),
        makeEntry(sourceYear, sourceOwnRoshHashanaKey, "sourceYear's own Rosh Hashana - must not leak in", true),
      ],
    };

    const result = resolveThisWeek(sourceYear, catalog, today);

    expect(result.map((r) => r.entry.occasionLabel)).toEqual(['Erev Rosh Hashana']);
  });
});

describe('resolveThisWeekAllYears', () => {
  it('finds an occasion on the same Hebrew (month, day) in a year with no kvius relationship to the current one at all', () => {
    const targetYear = 5786;
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6);
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    // 5711 is picked with no regard for kvius matching - the whole point is that this doesn't require one.
    const unrelatedYear = 5711;
    const key = toMafteiachHebrewDateKey({ year: unrelatedYear, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });
    const catalog: CatalogByYear = { [unrelatedYear]: [makeEntry(unrelatedYear, key, 'Shabbos 5711', true)] };

    const result = resolveThisWeekAllYears(catalog, today);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ hebrewYear: unrelatedYear, entries: [catalog[unrelatedYear]![0]] });
  });

  it('groups by year, sorted most recent first, omitting years with nothing this week', () => {
    const targetYear = 5786;
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6);
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const oldKey = toMafteiachHebrewDateKey({ year: 5711, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });
    const newKey = toMafteiachHebrewDateKey({ year: 5730, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });
    const catalog: CatalogByYear = {
      5711: [makeEntry(5711, oldKey, 'old', true)],
      5720: [makeEntry(5720, 'not-this-week', 'unrelated gap year', true)],
      5730: [makeEntry(5730, newKey, 'new', true)],
    };

    const result = resolveThisWeekAllYears(catalog, today);

    expect(result.map((r) => r.hebrewYear)).toEqual([5730, 5711]);
  });

  it('omits an occasion with neither audio nor a PDF, same as resolveThisWeek', () => {
    const targetYear = 5786;
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6);
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const key = toMafteiachHebrewDateKey({ year: 5711, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });
    const catalog: CatalogByYear = { 5711: [makeEntry(5711, key, 'gap', false)] };

    expect(resolveThisWeekAllYears(catalog, today)).toEqual([]);
  });

  it('includes a kvius-matched year too - it is still a real occasion on one of these dates', () => {
    const targetYear = 5786;
    const { hebrewYear: sourceYear } = findMatchingYears(targetYear, { fromYear: 5700, toYear: targetYear })[0]!;
    const targetShabbos = new HDate(15, 7, targetYear).onOrAfter(6);
    const sourceKey = toMafteiachHebrewDateKey({ year: sourceYear, month: targetShabbos.getMonth(), day: targetShabbos.getDate() });
    const catalog: CatalogByYear = { [sourceYear]: [makeEntry(sourceYear, sourceKey, 'Shabbos', true)] };
    const today = new Date(`${targetShabbos.greg().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const result = resolveThisWeekAllYears(catalog, today);

    expect(result.map((r) => r.hebrewYear)).toContain(sourceYear);
  });
});
