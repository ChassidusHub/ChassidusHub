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

const AsyncStorage = require('@react-native-async-storage/async-storage') as { setItem: jest.Mock };
const reading = require('../../seforim/readingState') as typeof import('../../seforim/readingState');
const appMode = require('../../appMode/appMode') as typeof import('../../appMode/appMode');
const { SafeAreaProvider } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
const { ThemeProvider } = require('../../ui/theme') as typeof import('../../ui/theme');
const { LanguageProvider } = require('../../i18n/LanguageProvider') as typeof import('../../i18n/LanguageProvider');
const { DownloadProvider } = require('../../download/DownloadProvider') as typeof import('../../download/DownloadProvider');
const { PlayerProvider } = require('../../player/PlayerProvider') as typeof import('../../player/PlayerProvider');
const screens = {
  ...(require('./RebbeScreen') as typeof import('./RebbeScreen')),
  ...(require('../library/LibraryScreen') as typeof import('../library/LibraryScreen')),
  ...(require('./WorkScreen') as typeof import('./WorkScreen')),
  ...(require('./ReaderScreen') as typeof import('./ReaderScreen')),
  ...(require('../SearchScreen') as typeof import('../SearchScreen')),
  ...(require('./HebrewBooksShelfScreen') as typeof import('./HebrewBooksShelfScreen')),
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

  it('lists the Rebbeim on the shelf, each with his seforim', async () => {
    const shelf = await render(<screens.LibraryScreen {...props(undefined)} />);
    expect(shelf).toContain('The Alter Rebbe');
    expect(shelf).toContain('Chassidim and collections');
    const shown = await render(<screens.RebbeScreen {...props({ authorId: 'alter-rebbe' })} />);
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
    // The chapter opened, then the one before it, put above it to scroll up into.
    const asked = (globalThis.fetch as jest.Mock).mock.calls.map((call) => decodeURIComponent(String(call[0])));
    expect(asked).toHaveLength(2);
    expect(asked[0]).toContain('Likkutei_Amarim_1?');
    expect(asked[1]).toContain("Compiler's_Foreword");
    expect(shown).toContain("Part I; Likkutei Amarim, Compiler's Foreword");
  });

  it('sets a Hebrew text right to left, whatever the app language', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ versions: [{ text: ['1 The first words'] }] }) })) as unknown as typeof fetch;
    const shown = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
    // Right to left on the text itself (Android ignores writingDirection), and a paragraph opening
    // with a number or a Latin letter still starts on the right.
    expect(shown).toContain('"direction":"rtl"');
    expect(shown).toContain('"‏"');
  });

  it('shows the edition being read as one control, the others behind it', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ versions: [{ text: ['The first words'] }] }) })) as unknown as typeof fetch;
    const shown = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
    expect(shown).toContain('Edition: Hebrew');
    // The other editions are in its sheet, closed until it is opened.
    expect(shown).not.toContain('English (Kehot)');
  });

  it('reads a letter of the Igros from the catalog API, in David, with its notes after it', async () => {
    // A made-up letter in the form import-igros writes (packages/igros-index's letterHtml): the real ones are
    // ChassidusHub's, not kept in git. It is padded to the length the catalog gives letter 1, which the reader checks.
    const made =
      '<article dir="rtl" lang="he" data-id="1"><p class="end">\u05D1"\u05D4</p><p>\u05E9\u05DC\u05D5\u05DD \u05D5\u05D1\u05E8\u05DB\u05D4</p>' +
      '<aside class="notes"><p>1) \u05D4\u05E2\u05E8\u05D4</p></aside><footer class="source">\u05D0\u05D2\u05E8\u05D5\u05EA \u05E7\u05D5\u05D3\u05E9 \u05D7\u05DC\u05E7 \u05D0, \u05D0</footer></article>';
    const letter = made.replace('</article>', `${' '.repeat(4139 - 1 - encodeURIComponent(made).replace(/%[0-9A-F]{2}/g, 'x').length)}</article>\n`);
    const asked: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => ({}), text: async () => letter };
    }) as unknown as typeof fetch;
    const shown = await render(<screens.ReaderScreen {...props({ workId: 'igros-kodesh-rebbe', unitId: '1' })} />);
    expect(asked).toEqual(['https://api.sk.chassidushub.org/v3/texts/3dda44babea1c3ef52ee262b5d2456dda32c8604eb9b80819d5110aad953ef47']);
    expect(shown).toContain('Letter 1');
    expect(shown).toContain('DavidCLM');
    expect(shown).toContain('Notes');
    expect(shown).toContain('\u05D0\u05D2\u05E8\u05D5\u05EA \u05E7\u05D5\u05D3\u05E9 \u05D7\u05DC\u05E7 \u05D0');
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

  describe('the reader settings', () => {
    const sefaria = (segment: string) =>
      jest.fn(async () => ({ ok: true, json: async () => ({ versions: [{ text: [segment] }] }) })) as unknown as typeof fetch;
    afterEach(() => reading.resetReadingState());

    it('says where the chapter falls in the sefer', async () => {
      globalThis.fetch = sefaria('words');
      expect(await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />)).toMatch(/Chapter \d+ of \d+/);
    });

    it('takes the vowels off when asked', async () => {
      // בְּרֵאשִׁית with its points, then the same word bare.
      const pointed = '\u05D1\u05BC\u05B0\u05E8\u05B5\u05D0\u05E9\u05C1\u05B4\u05D9\u05EA';
      globalThis.fetch = sefaria(pointed);
      expect(await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />)).toContain(pointed);
      reading.setReaderSettings({ niqqud: false });
      globalThis.fetch = sefaria(pointed);
      const bare = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
      expect(bare).toContain('\u05D1\u05E8\u05D0\u05E9\u05D9\u05EA');
      expect(bare).not.toContain(pointed);
    });

    it('shows a note in the text, or as a number with the notes at the end', async () => {
      const noted = 'The words<sup class="footnote-marker">1</sup><i class="footnote">The note itself</i> go on.';
      globalThis.fetch = sefaria(noted);
      const atEnd = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
      expect(atEnd).toContain('Notes');
      reading.setReaderSettings({ notes: 'inline' });
      globalThis.fetch = sefaria(noted);
      const inline = await render(<screens.ReaderScreen {...props({ workId: 'tanya', unitId: 'part1/1' })} />);
      expect(inline).toContain('The note itself');
      expect(inline).not.toContain('"Notes"');
    });

    it('keeps the settings on the phone', () => {
      reading.setReaderSettings({ font: 'david', theme: 'sepia', scale: 1.4 });
      const stored = JSON.parse(AsyncStorage.setItem.mock.calls.at(-1)[1]);
      expect(stored.settings).toMatchObject({ font: 'david', theme: 'sepia', scale: 1.4 });
      reading.recordPlace('tanya', 'part1/1', 1, 0.4567);
      expect(reading.getReadingState().places.tanya).toMatchObject({ unitId: 'part1/1', source: 1, offset: 0.457 });
    });
  });

  describe('the HebrewBooks shelf', () => {
    it('gives each Rebbe his other books on HebrewBooks, and the other Chabad books a row of their own', async () => {
      // On the Rebbe's own page, after his seforim: no shelf of external links of their own.
      const shown = await render(<screens.RebbeScreen {...props({ authorId: 'the-rebbe' })} />);
      expect(shown).toContain('More on HebrewBooks');
      expect(await render(<screens.RebbeScreen {...props({ authorId: null })} />)).toContain('Chabad books on HebrewBooks');
      // Sichos Kodesh has no text anywhere yet: it is its scans.
      expect(shown).toContain('Sichos Kodesh');
      expect(shown).toMatch(/\d+ scans/);
    });

    it('never shows the external links in offline mode', async () => {
      appMode.setAppMode('offline');
      try {
        const shown = await render(<screens.RebbeScreen {...props({ authorId: 'the-rebbe' })} />);
        expect(shown).not.toContain('More on HebrewBooks');
        expect(shown).not.toContain('Sichos Kodesh');
        expect(await render(<screens.RebbeScreen {...props({ authorId: 'alter-rebbe' })} />)).toContain('Tanya');
      } finally {
        appMode.setAppMode('online');
      }
    });

    it('lists a sefer\'s scans on its screen, each opening on HebrewBooks', async () => {
      const shown = await render(<screens.WorkScreen {...props({ workId: 'likkutei-sichos' })} />);
      expect(shown).toContain('Scans on HebrewBooks');
      expect(shown).toContain('\u05D0 (\u05D1\u05E8\u05D0\u05E9\u05D9\u05EA - \u05E9\u05DE\u05D5\u05EA - \u05D5\u05D9\u05E7\u05E8\u05D0)');
      expect(shown).toMatch(/Show all \d+/);
      expect(shown).toContain('306 pages');
      // A sefer with only scans says where to read it.
      expect(await render(<screens.WorkScreen {...props({ workId: 'sichos-kodesh' })} />)).toContain('its scans open on HebrewBooks');
    });

    it('lists an author\'s other books by series, with Otzaria credited', async () => {
      const shelf = await render(<screens.HebrewBooksShelfScreen {...props({ authorId: 'the-rebbe' })} />);
      // Headed by the name alone, so it fits instead of trailing off; the help line says HebrewBooks.
      expect(shelf).toContain('"The Rebbe"');
      expect(shelf).not.toContain('The Rebbe on HebrewBooks');
      expect(shelf).toContain('\u05E9\u05E2\u05E8\u05D9 \u05D4\u05DE\u05D5\u05E2\u05D3\u05D9\u05DD');
      expect(shelf).toContain('Otzaria');
      // The seforim here list their own scans; the shelf leaves them out.
      expect(shelf).not.toContain('"\u05DC\u05E7\u05D5\u05D8\u05D9 \u05E9\u05D9\u05D7\u05D5\u05EA"');
      const others = await render(<screens.HebrewBooksShelfScreen {...props({ authorId: null })} />);
      expect(others).toContain('"Chabad books"');
      const series = await render(<screens.HebrewBooksShelfScreen {...props({ authorId: 'the-rebbe', series: 0 })} />);
      expect(series).toMatch(/\d+ pages/);
      // Each book is one line, its name and its pages: no line of where it was printed under every one.
      expect(series).not.toContain(' pages \u00B7 ');
    });
  });

  it("opens the one search on the seforim, from the seforim's own link", async () => {
    const page = await render(<screens.SearchScreen {...props({ scope: 'seforim' })} />);
    expect(page).toContain('Search');
    // Narrowed to the seforim: their chip is set, with a way back to everything.
    expect(page).toContain('"Seforim"');
    expect(page).toContain('Clear filters');
  });
});
