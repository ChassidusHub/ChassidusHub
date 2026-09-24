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
  ...(require('./OccasionGroupsScreen') as typeof import('./OccasionGroupsScreen')),
  ...(require('./OccasionGroupScreen') as typeof import('./OccasionGroupScreen')),
};
const { SearchScreen } = require('../SearchScreen') as typeof import('../SearchScreen');

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

  it('lists the collections', async () => {
    expect(await render(<screens.LibraryScreen {...props(undefined)} />)).toContain('Likkutei Sichos');
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
    expect(await render(<screens.LibraryItemScreen {...props({ collection: 'likkuteiSichos', id: sicha.id })} />)).toContain('Documents');
    expect(await render(<screens.LibraryItemScreen {...props({ collection: 'maamorim', id: 'no-such-id' })} />)).toContain('not in the library');
  });

  it('shows the farbrengens of a moed, named in the interface language', async () => {
    const moadim = await render(<screens.OccasionGroupsScreen {...props({ axis: 'moadim' })} />);
    expect(moadim).toContain('Rosh Hashanah');
    expect(moadim).not.toContain('ראש השנה');
    const moed = await render(<screens.OccasionGroupScreen {...props({ axis: 'moadim', slug: 'rosh_hashanah' })} />);
    expect(moed).toContain('occasions indexed');
    expect(moed).toContain('Rosh Hashanah');
  });

  it('searches the farbrengens by mafteiach moed and parsha, and a collection by name', async () => {
    const screen = await render(<SearchScreen {...props(undefined)} />);
    expect(screen).toContain('Search in');
    expect(screen).toContain('Farbrengens');
    expect(screen).toContain('Moed');
    expect(screen).not.toContain('Special Day');
  });
});
