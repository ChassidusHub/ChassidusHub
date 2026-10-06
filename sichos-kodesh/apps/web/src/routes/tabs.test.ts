import { describe, expect, it } from 'vitest';
import { farbrengensPath, isTabRoot, showsTabs, tabForPath } from './tabs';

describe('the tabs', () => {
  it('lights the tab a page belongs to, from its path alone', () => {
    expect(tabForPath('/')).toBe('week');
    expect(tabForPath('/kvius')).toBe('week');
    expect(tabForPath('/follow/5736/12')).toBe('week');
    expect(tabForPath('/this-week-all-years/5740/3')).toBe('week');
    expect(tabForPath('/library/this-parsha')).toBe('week');

    expect(tabForPath('/farbrengens')).toBe('farbrengens');
    expect(tabForPath('/f/5736/500')).toBe('farbrengens');
    expect(tabForPath('/browse/5736/month/07')).toBe('farbrengens');
    expect(tabForPath('/occasion-all-years/5736/12')).toBe('farbrengens');
    expect(tabForPath('/farbrengens/moed/yud_shvat')).toBe('farbrengens');
    expect(tabForPath('/farbrengens/parsha/bereshit')).toBe('farbrengens');

    expect(tabForPath('/library')).toBe('library');
    expect(tabForPath('/l/maamorim')).toBe('library');
    expect(tabForPath('/l/maamorim/1234')).toBe('library');
    expect(tabForPath('/s/tanya/2')).toBe('library');
    expect(tabForPath('/s/by/the-rebbe')).toBe('library');

    expect(tabForPath('/search')).toBe('search');

    expect(tabForPath('/me')).toBe('mine');
    expect(tabForPath('/settings/downloads')).toBe('mine');
    expect(tabForPath('/downloaded')).toBe('mine');
    expect(tabForPath('/about')).toBe('mine');
  });

  it('does not take a path that only starts the same for one under it', () => {
    expect(tabForPath('/library-old')).toBe('week');
    expect(tabForPath('/settings')).toBe('mine');
    expect(tabForPath('/meetings')).toBe('week');
  });

  it('hides the tabs on a PDF and in the reader, and nowhere else', () => {
    expect(showsTabs('/f/5736/12/pdf/abc')).toBe(false);
    expect(showsTabs('/l/maamorim/12/pdf/abc')).toBe(false);
    expect(showsTabs('/s/tanya/read')).toBe(false);
    expect(showsTabs('/s/tanya')).toBe(true);
    expect(showsTabs('/follow/5736/12')).toBe(true);
  });

  it("knows each tab's first page, and the farbrengens' views", () => {
    expect(isTabRoot('/')).toBe(true);
    expect(isTabRoot('/me')).toBe(true);
    expect(isTabRoot('/library')).toBe(true);
    expect(isTabRoot('/l/maamorim')).toBe(false);
    expect(farbrengensPath()).toBe('/farbrengens');
    expect(farbrengensPath('moed')).toBe('/farbrengens?by=moed');
  });
});
