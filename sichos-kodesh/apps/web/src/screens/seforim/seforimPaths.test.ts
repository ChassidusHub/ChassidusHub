import { describe, expect, it } from 'vitest';
import { readerPath, shelfPath, workPath } from './seforimPaths';

describe('seforim paths', () => {
  it('carries a unit id with slashes in the query, with its edition when given', () => {
    expect(readerPath('tanya', 'part1/1')).toBe('/seforim/tanya/read?unit=part1%2F1');
    expect(readerPath('tanya', 'part1/1', 2)).toBe('/seforim/tanya/read?unit=part1%2F1&source=2');
  });

  it('opens a sefer on one part of its contents', () => {
    expect(workPath('likkutei-torah')).toBe('/seforim/likkutei-torah');
    expect(workPath('likkutei-torah', [1, 0])).toBe('/seforim/likkutei-torah?path=1.0');
  });

  it('opens an author\'s HebrewBooks shelf, or one series of it', () => {
    expect(shelfPath('the-rebbe')).toBe('/seforim/hebrewbooks/the-rebbe');
    expect(shelfPath('the-rebbe', 3)).toBe('/seforim/hebrewbooks/the-rebbe?series=3');
    expect(shelfPath(null)).toBe('/seforim/hebrewbooks/others');
  });
});
