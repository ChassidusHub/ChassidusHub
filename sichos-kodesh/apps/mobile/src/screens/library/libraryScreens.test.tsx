import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-track-player');

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/tmp' },
    exists: jest.fn(() => Promise.resolve(false)),
    ls: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({ size: '0' })),
    unlink: jest.fn(() => Promise.resolve()),
    mv: jest.fn(() => Promise.resolve()),
  },
}));

const mockNavigation = { navigate: jest.fn(), setParams: jest.fn(), goBack: jest.fn(), canGoBack: () => true, replace: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const { SafeAreaProvider } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
const { ThemeProvider } = require('../../ui/theme') as typeof import('../../ui/theme');
const { LanguageProvider } = require('../../i18n/LanguageProvider') as typeof import('../../i18n/LanguageProvider');
const { DownloadProvider } = require('../../download/DownloadProvider') as typeof import('../../download/DownloadProvider');
const { PlayerProvider } = require('../../player/PlayerProvider') as typeof import('../../player/PlayerProvider');
const { catalogStore } = require('../../catalog/catalogStore') as typeof import('../../catalog/catalogStore');
const screens = {
  ...(require('./LibraryScreen') as typeof import('./LibraryScreen')),
  ...(require('./LibraryCollectionScreen') as typeof import('./LibraryCollectionScreen')),
  ...(require('./LibraryGroupScreen') as typeof import('./LibraryGroupScreen')),
  ...(require('./LibraryItemScreen') as typeof import('./LibraryItemScreen')),
  ...(require('./OccasionGroupScreen') as typeof import('./OccasionGroupScreen')),
};
const { SearchScreen } = require('../SearchScreen') as typeof import('../SearchScreen');
const { FarbrengensScreen } = require('../FarbrengensScreen') as typeof import('../FarbrengensScreen');
const { MineScreen } = require('../MineScreen') as typeof import('../MineScreen');
const { YearPickerScreen } = require('../YearPickerScreen') as typeof import('../YearPickerScreen');
const { FarbrengenScreen } = require('../FarbrengenScreen') as typeof import('../FarbrengenScreen');

async function render(element: React.ReactElement): Promise<string> {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <LanguageProvider>
            <DownloadProvider>
              <PlayerProvider>{element}</PlayerProvider>
            </DownloadProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const text = JSON.stringify(renderer!.toJSON());
  await ReactTestRenderer.act(async () => renderer!.unmount());
  return text;
}

// A stand-in for React Navigation's screen props.
const props = (params: unknown): any => ({ navigation: mockNavigation, route: { key: 'k', name: 'x', params } });

describe('library screens', () => {
  const library = catalogStore.getLibrary()!;

  it('opens on one shelf: the Rebbe\'s Torah with Igros Kodesh among it, then the diaries and recordings, then the Rebbeim', async () => {
    const shelf = await render(<screens.LibraryScreen {...props(undefined)} />);
    for (const name of ["The Rebbe's Torah", 'Likkutei Sichos', 'Igros Kodesh', 'Diaries and recordings', 'Yomanim', "The Rebbeim's seforim", 'The Alter Rebbe']) expect(shelf).toContain(name);
    expect(shelf.indexOf('Igros Kodesh')).toBeLessThan(shelf.indexOf('Yomanim'));
    expect(shelf.indexOf('Yomanim')).toBeLessThan(shelf.indexOf('The Alter Rebbe'));
  });

  it('shows a collection on each of its axes', async () => {
    expect(await render(<screens.LibraryCollectionScreen {...props({ collection: 'likkuteiSichos' })} />)).toContain('Volume 1');
    expect(await render(<screens.LibraryCollectionScreen {...props({ collection: 'maamorim', axis: 'melukat' })} />)).toContain('Melukat, volume 1');
  });

  it('lists a group and opens an item with its files', async () => {
    const group = library.collections.maamorim.groups.year![10]!;
    expect(await render(<screens.LibraryGroupScreen {...props({ collection: 'maamorim', axis: 'year', slug: group.slug })} />)).toContain('items');
    const withAudio = library.collections.jemEvents.items.find((item) => item.refs.some((ref) => ref.kind === 'audio'))!;
    expect(await render(<screens.LibraryItemScreen {...props({ collection: 'jemEvents', id: withAudio.id })} />)).toContain(withAudio.label);
    const sicha = library.collections.likkuteiSichos.items[0]!;
    expect(await render(<screens.LibraryItemScreen {...props({ collection: 'likkuteiSichos', id: sicha.id })} />)).toContain('Texts');
    // A maamar's texts, then its recordings with Play, on the one page.
    const maamar = library.collections.maamorim.items.find((item) => item.refs.some((ref) => ref.kind === 'audio') && item.refs.some((ref) => ref.kind === 'pdf'))!;
    const page = await render(<screens.LibraryItemScreen {...props({ collection: 'maamorim', id: maamar.id })} />);
    expect(page.indexOf('Texts')).toBeGreaterThan(-1);
    expect(page.indexOf('Texts')).toBeLessThan(page.indexOf('Recordings'));
    expect(await render(<screens.LibraryItemScreen {...props({ collection: 'maamorim', id: 'no-such-id' })} />)).toContain('not in the library');
  });

  it('shows the farbrengens by year, and by moed named in the interface language', async () => {
    const years = await render(<FarbrengensScreen {...props(undefined)} />);
    expect(years).toContain('By year');
    expect(years).toContain('5711');
    const moadim = await render(<FarbrengensScreen {...props({ view: 'moed' })} />);
    expect(moadim).toContain('Rosh Hashanah');
    expect(moadim).not.toContain('ראש השנה');
    const moed = await render(<screens.OccasionGroupScreen {...props({ axis: 'moadim', slug: 'rosh_hashanah' })} />);
    expect(moed).toContain('occasions indexed');
    expect(moed).toContain('Rosh Hashanah');
  });

  it('opens on this week: the kvius year, every year, the parsha, without the old doors', async () => {
    const week = await render(<YearPickerScreen {...props(undefined)} />);
    expect(week).toContain('Every kvius year');
    expect(week).not.toContain('Everything in the library');
    expect(week).not.toContain('By moed');
  });

  it("lays out a farbrengen's one page: its recordings, then its texts, then the ones around it", async () => {
    const entry = catalogStore.getCatalog()[5736]!.find((e) => e.audio.length > 0 && e.pdfs.some((pdf) => pdf.section === 'biltiMugah'))!;
    const page = await render(<FarbrengenScreen {...props({ kind: 'browse', hebrewYear: entry.hebrewYear, occasionId: entry.occasionId })} />);
    expect(page).toContain('Recordings');
    expect(page).toContain('Texts');
    expect(page).toContain('Previous');
    expect(page.indexOf('Recordings')).toBeLessThan(page.indexOf('Texts'));
    expect(await render(<FarbrengenScreen {...props({ kind: 'browse', hebrewYear: 5736, occasionId: -1 })} />)).toContain('be found');
  });

  it("shows the listener's own tab: downloads, Settings and About", async () => {
    const mine = await render(<MineScreen {...props(undefined)} />);
    expect(mine).toContain('Mine');
    expect(mine).toContain('Downloaded content');
    expect(mine).toContain('Settings');
    expect(mine).toContain('About');
  });

  it('searches everything at once, with its filters as chips that each open a short list', async () => {
    const screen = await render(<SearchScreen {...props(undefined)} />);
    for (const chip of ['Where', 'Year', 'Month', 'Parsha', 'Moed', 'Contents']) expect(screen).toContain(`"${chip}"`);
    // Nothing is narrowed yet, so there is nothing to clear.
    expect(screen).not.toContain('Clear filters');
    expect(screen).not.toContain('Special Day');
  });

  it("searches the library alone from the Library tab's box, with the words it was given", async () => {
    const screen = await render(<SearchScreen {...props({ scope: 'library', query: 'Tanya' })} />);
    expect(screen).toContain('"The library"');
    expect(screen).toContain('Clear filters');
    // The farbrengens are not searched, and what a farbrengen has is not a filter here.
    expect(screen).not.toContain('"Contents"');
    expect(screen).toContain('"value":"Tanya"');
  });
});
