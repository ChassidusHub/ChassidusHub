import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-track-player');

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const { SafeAreaProvider } = require('react-native-safe-area-context') as typeof import('react-native-safe-area-context');
const { ThemeProvider } = require('../ui/theme') as typeof import('../ui/theme');
const { LanguageProvider } = require('../i18n/LanguageProvider') as typeof import('../i18n/LanguageProvider');
const { PlayerContext } = require('../player/playerContext') as typeof import('../player/playerContext');
const { GlobalPlayerBar } = require('./GlobalPlayerBar') as typeof import('./GlobalPlayerBar');

type Player = import('../player/playerContext').PlayerContextValue;

/** A player loaded with a three-chapter farbrengen, 30 seconds into its second chapter. */
function fakePlayer(overrides: Partial<Player> = {}): Player {
  return {
    playlist: {
      title: "ו' תשרי",
      titleEn: '6 Tishrei',
      audio: [
        { workerFilename: 'a.mp3', durationMs: 60_000, chapterName: 'Sicha 1' },
        { workerFilename: 'b.mp3', durationMs: 120_000, chapterName: 'Sicha 2' },
        { workerFilename: 'c.mp3', durationMs: 90_000, chapterName: 'Sicha 3' },
      ],
      hebrewYear: 5736,
      occasionId: 1,
      hebrewDate: '5736-01-06',
    },
    currentIndex: 1,
    playing: true,
    loading: false,
    currentTime: 30,
    duration: 120,
    error: null,
    play: jest.fn(),
    togglePlay: jest.fn(),
    pause: jest.fn(),
    next: jest.fn(),
    prev: jest.fn(),
    playChapter: jest.fn(),
    seekToFraction: jest.fn(),
    seekBy: jest.fn(),
    playbackRate: 1,
    playbackRateAllowed: false,
    setPlaybackRate: jest.fn(),
    ...overrides,
  };
}

async function mount(player: Player) {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ThemeProvider>
          <LanguageProvider>
            <PlayerContext.Provider value={player}>
              <GlobalPlayerBar />
            </PlayerContext.Provider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return renderer!;
}

/** The pressable with this accessibility label (or one starting with it). */
function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const node = renderer.root.find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label) && typeof n.props.onPress === 'function');
  return ReactTestRenderer.act(async () => node.props.onPress());
}

describe('the player', () => {
  it('shows nothing until something has played', async () => {
    const renderer = await mount(fakePlayer({ playlist: null }));
    expect(renderer.root.findByType(GlobalPlayerBar).children).toHaveLength(0);
  });

  it('is a mini player with the title and the chapter, and play/pause', async () => {
    const player = fakePlayer();
    const renderer = await mount(player);
    const text = JSON.stringify(renderer.toJSON());
    expect(text).toContain('6 Tishrei');
    expect(text).toContain('2/3 · Sicha 2');
    // The full player's controls aren't there until it opens.
    expect(text).not.toContain('Forward 15 seconds');
    await press(renderer, 'Pause');
    expect(player.togglePlay).toHaveBeenCalled();
  });

  it('opens the full player: 15 seconds each way, the chapters around, and the chapter list', async () => {
    const player = fakePlayer();
    const renderer = await mount(player);
    await press(renderer, 'Open the player');
    const text = JSON.stringify(renderer.toJSON());
    for (const chapter of ['Sicha 1', 'Sicha 2', 'Sicha 3', 'Chapters']) expect(text).toContain(chapter);
    await press(renderer, 'Forward 15 seconds');
    expect(player.seekBy).toHaveBeenLastCalledWith(15);
    await press(renderer, 'Back 15 seconds');
    expect(player.seekBy).toHaveBeenLastCalledWith(-15);
    await press(renderer, 'Next chapter');
    expect(player.next).toHaveBeenCalled();
    // No speed control on the Rebbe's own recordings.
    expect(text).not.toContain('Playback speed');
  });
});
