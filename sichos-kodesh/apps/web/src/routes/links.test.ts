import { describe, expect, it } from 'vitest';
import { canonicalFarbrengenPath, farbrengenPath, farbrengenPdfPath } from './links';

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
