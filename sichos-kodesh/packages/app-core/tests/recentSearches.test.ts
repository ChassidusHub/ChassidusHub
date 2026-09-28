import { describe, expect, it } from 'vitest';
import { parshiot } from '@hebcal/core';
import type { CatalogLibrary } from '@sichos-kodesh/catalog';
import { RECENT_SEARCHES_MAX, occasionParshaSlugs, parseRecentSearches, rememberSearch } from '../src/index.js';

describe('recent searches', () => {
  it('keeps the newest first, once only, and no more than the most', () => {
    expect(rememberSearch([], '  yud   shvat ')).toEqual(['yud shvat']);
    expect(rememberSearch(['Tanya', 'yud shvat'], 'YUD SHVAT')).toEqual(['YUD SHVAT', 'Tanya']);
    const full = Array.from({ length: RECENT_SEARCHES_MAX }, (_, i) => `search ${i}`);
    expect(rememberSearch(full, 'new one')).toHaveLength(RECENT_SEARCHES_MAX);
    expect(rememberSearch(full, 'new one')[0]).toBe('new one');
  });

  it('leaves the list alone for a letter or nothing', () => {
    expect(rememberSearch(['Tanya'], 'a')).toEqual(['Tanya']);
    expect(rememberSearch(['Tanya'], '   ')).toEqual(['Tanya']);
  });

  it('reads back only what it stored', () => {
    expect(parseRecentSearches(['Tanya', 3, null, ' ', 'Noach'])).toEqual(['Tanya', 'Noach']);
    expect(parseRecentSearches({ not: 'a list' })).toEqual([]);
  });
});

describe("the farbrengens of this week's parsha", () => {
  // mafteiach's parshiyos: hebcal's order, without Vezos Haberachah.
  const library = { parshiyos: parshiot.slice(0, -1).map((name) => ({ slug: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, occasionIds: [] })) } as unknown as CatalogLibrary;

  it('finds a parsha by its place, and both of a joined pair', () => {
    expect(occasionParshaSlugs(library, ['Bereshit'])).toEqual(['bereshit']);
    expect(occasionParshaSlugs(library, ['Vayakhel', 'Pekudei'])).toEqual(['vayakhel', 'pekudei']);
    expect(occasionParshaSlugs(library, ['Vezot Haberakhah'])).toEqual([]);
    expect(occasionParshaSlugs(library, null)).toEqual([]);
  });

  it('finds nothing in a list of another length', () => {
    expect(occasionParshaSlugs({ parshiyos: library.parshiyos.slice(0, 10) } as unknown as CatalogLibrary, ['Bereshit'])).toEqual([]);
  });
});
