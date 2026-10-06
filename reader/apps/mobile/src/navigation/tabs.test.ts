import { showsTabs, tabForStack, tabStack } from './tabs';

describe('the tabs', () => {
  it("lights the top screen's own tab", () => {
    expect(tabForStack(['Home'])).toBe('week');
    expect(tabForStack(['Home', 'Farbrengens', 'YearBrowser'])).toBe('farbrengens');
    expect(tabForStack(['Home', 'Library', 'LibraryCollection', 'LibraryItem'])).toBe('library');
    expect(tabForStack(['Home', 'Search'])).toBe('search');
    expect(tabForStack(['Home', 'Mine', 'Settings', 'About'])).toBe('mine');
  });

  it('gives a farbrengen or a PDF the tab of the screen it was opened from', () => {
    expect(tabForStack(['Home', 'ThisWeek', 'Farbrengen', 'PdfViewer'])).toBe('week');
    expect(tabForStack(['Home', 'Farbrengens', 'OccasionGroup', 'Farbrengen'])).toBe('farbrengens');
    expect(tabForStack(['Home', 'Search', 'Farbrengen'])).toBe('search');
    expect(tabForStack([])).toBe('week');
  });

  it('hides the tabs on a PDF and in the reader, and nowhere else', () => {
    expect(showsTabs('PdfViewer')).toBe(false);
    expect(showsTabs('Reader')).toBe(false);
    expect(showsTabs('Work')).toBe(true);
    expect(showsTabs(undefined)).toBe(true);
  });

  it('opens a tab over This week, so Back lands there', () => {
    expect(tabStack('week')).toEqual([{ name: 'Home' }]);
    expect(tabStack('library')).toEqual([{ name: 'Home' }, { name: 'Library' }]);
  });
});
