import { describe, expect, it } from 'vitest';
import { canonicalFarbrengenPath, canonicalLibraryPath, farbrengenPath, farbrengenPdfPath, libraryGroupPath, libraryItemPath, readerPath, rebbePath, scansPath, seferPath, seferPathIndexes } from './links';

describe('one address per farbrengen', () => {
  it('builds the address and its PDFs', () => {
    expect(farbrengenPath(5736, 500)).toBe('/f/5736/500');
    expect(farbrengenPdfPath(5736, 500, 'a/b')).toBe('/f/5736/500/pdf/a%2Fb');
  });

  // Every address a farbrengen was shared under before - kept working for good.
  const OLD_ADDRESSES: Array<[string, string]> = [
    ['/follow/5736/500', '/f/5736/500'],
    ['/follow/5736/500/recordings', '/f/5736/500#audio'],
    ['/follow/5736/500/category/mugah', '/f/5736/500#texts'],
    ['/follow/5736/500/pdf/1AbC', '/f/5736/500/pdf/1AbC'],
    ['/browse/5711/11112833', '/f/5711/11112833'],
    ['/browse/5711/11112833/recordings', '/f/5711/11112833#audio'],
    ['/browse/5711/11112833/category/hagahos', '/f/5711/11112833#texts'],
    ['/browse/5711/11112833/pdf/1AbC', '/f/5711/11112833/pdf/1AbC'],
    ['/this-week-all-years/5740/12', '/f/5740/12'],
    ['/this-week-all-years/5740/12/recordings', '/f/5740/12#audio'],
    ['/this-week-all-years/5740/12/category/maamorim', '/f/5740/12#texts'],
    ['/this-week-all-years/5740/12/pdf/x', '/f/5740/12/pdf/x'],
    ['/occasion-all-years/5736/500/5745/700', '/f/5745/700'],
    ['/occasion-all-years/5736/500/5745/700/recordings', '/f/5745/700#audio'],
    ['/occasion-all-years/5736/500/5745/700/category/hosofos', '/f/5745/700#texts'],
    ['/occasion-all-years/5736/500/5745/700/pdf/x', '/f/5745/700/pdf/x'],
  ];

  it.each(OLD_ADDRESSES)('leads %s to %s', (old, now) => {
    expect(canonicalFarbrengenPath(old)).toBe(now);
  });

  it('leaves every other address alone', () => {
    for (const path of ['/', '/follow/5736', '/follow/5736/month', '/follow/5736/month/05', '/browse/5736', '/browse/5736/month/05', '/this-week-all-years', '/occasion-all-years/5736/500', '/f/5736/500', '/browse/5736/500/unknown/x'])
      expect(canonicalFarbrengenPath(path)).toBeNull();
  });
});

describe('one address per thing in the library', () => {
  it('builds the addresses', () => {
    expect(libraryItemPath('likkuteiSichos', '12:345')).toBe('/l/likkuteiSichos/12%3A345');
    expect(libraryGroupPath('maamorim', 'year', '5736')).toBe('/l/maamorim/year/5736');
    expect(libraryGroupPath('likkuteiSichos', 'volume', '5', 'bereshit')).toBe('/l/likkuteiSichos/volume/5?section=bereshit');
    expect(seferPath('igros-kodesh-rebbe', [11])).toBe('/s/igros-kodesh-rebbe/12');
    expect(seferPath('likkutei-torah')).toBe('/s/likkutei-torah');
    expect(readerPath('tanya', 'part1/1', 2)).toBe('/s/tanya/read?unit=part1%2F1&source=2');
    expect(rebbePath('the-rebbe')).toBe('/s/by/the-rebbe');
    expect(rebbePath(null)).toBe('/s/by/others');
    expect(scansPath('the-rebbe', 3)).toBe('/s/hebrewbooks/the-rebbe?series=3');
  });

  it("reads a sefer's part back from its address, counting from 1", () => {
    expect(seferPathIndexes(['12'])).toEqual([11]);
    expect(seferPathIndexes(['2', '1', ''])).toEqual([1, 0]);
    expect(seferPathIndexes([''])).toEqual([]);
    expect(seferPathIndexes(['0'])).toBeNull();
    expect(seferPathIndexes(['x'])).toBeNull();
  });

  // Every library and seforim address before the one shelf - kept working for good.
  const OLD_ADDRESSES: Array<[string, string, string]> = [
    ['/library/c/maamorim', '', '/l/maamorim'],
    ['/library/c/maamorim', '?axis=melukat', '/l/maamorim?axis=melukat'],
    ['/library/c/likkuteiSichos/volume/5', '', '/l/likkuteiSichos/volume/5'],
    ['/library/c/likkuteiSichos/volume/5', '?section=bereshit', '/l/likkuteiSichos/volume/5?section=bereshit'],
    ['/library/item/likkuteiSichos/12%3A345', '', '/l/likkuteiSichos/12%3A345'],
    ['/library/item/maamorim/1234/recordings', '', '/l/maamorim/1234#audio'],
    ['/library/item/maamorim/1234/pdf/1AbC', '', '/l/maamorim/1234/pdf/1AbC'],
    ['/library/moadim/yud_shvat', '', '/farbrengens/moed/yud_shvat'],
    ['/library/parshiyos/bereshit', '', '/farbrengens/parsha/bereshit'],
    ['/library/moadim', '', '/farbrengens?by=moed'],
    ['/seforim', '', '/library'],
    ['/seforim', '?shelf=links', '/library'],
    ['/seforim/search', '', '/search?in=seforim'],
    ['/seforim/tanya', '', '/s/tanya'],
    ['/seforim/likkutei-torah', '?path=1.0', '/s/likkutei-torah/2/1'],
    ['/seforim/tanya/read', '?unit=part1%2F1&source=2', '/s/tanya/read?unit=part1%2F1&source=2'],
    ['/seforim/hebrewbooks/the-rebbe', '', '/s/hebrewbooks/the-rebbe'],
    ['/seforim/hebrewbooks/others', '?series=3', '/s/hebrewbooks/others?series=3'],
  ];

  it.each(OLD_ADDRESSES)('leads %s%s to %s', (old, search, now) => {
    expect(canonicalLibraryPath(old, search)).toBe(now);
  });

  it('leaves every other address alone', () => {
    for (const path of ['/', '/library', '/l/maamorim', '/s/tanya', '/library/item/maamorim', '/library/item/maamorim/1/unknown', '/f/5736/500']) expect(canonicalLibraryPath(path)).toBeNull();
  });
});
