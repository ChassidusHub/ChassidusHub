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
    readFile: jest.fn(() => Promise.reject(new Error('no file'))),
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
const screens = {
  ...(require('./SeforimScreen') as typeof import('./SeforimScreen')),
  ...(require('./WorkScreen') as typeof import('./WorkScreen')),
  ...(require('./ReaderScreen') as typeof import('./ReaderScreen')),
  ...(require('./SeforimSearchScreen') as typeof import('./SeforimSearchScreen')),
};

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
  // Lets the reader's text load settle.
  await ReactTestRenderer.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  const text = JSON.stringify(renderer!.toJSON());
  await ReactTestRenderer.act(async () => renderer!.unmount());
  return text;
}

// A stand-in for React Navigation's screen props.
const props = (params: unknown): any => ({ navigation: mockNavigation, route: { key: 'k', name: 'x', params } });

describe('seforim screens', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('lists the Rebbeim with their seforim', async () => {
    const shown = await render(<screens.SeforimScreen {...props(undefined)} />);
    expect(shown).toContain('Tanya');
    expect(shown).toContain('Likkutei Torah');
  });

  it('opens a sefer on its contents, and a part of it on its chapters', async () => {
    const top = await render(<screens.WorkScreen {...props({ workId: 'tanya' })} />);
    expect(top).toContain('Part I; Likkutei Amarim');
    // How much saving it on the phone takes: its texts, as the catalog counts them.
    expect(top).toMatch(/Saves every chapter here \(about \d+\.\d MB\)/);
    expect(await render(<screens.WorkScreen {...props({ workId: 'tanya', path: [0] })} />)).toContain('Chapter 1');
  });

  it('reads a chapter live from Sefaria when the phone has no pack', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ versions: [{ text: ['<b>The first words</b> of the chapter'] }] }) })) as unknown as typeof fetch;
    const shown = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
    expect(shown).toContain('The first words');
    expect(shown).toContain('Part I; Likkutei Amarim, Chapter 1');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('says so when Sefaria cannot be reached', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    const shown = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
    expect(shown).toContain('Try again');
    // Once: a failure is not retried on its own, only when the connection comes back.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('opens the search', async () => {
    expect(await render(<screens.SeforimSearchScreen {...props(undefined)} />)).toContain('Search');
  });
});
