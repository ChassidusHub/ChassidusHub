// Jest manual mock for react-native-track-player.
// The real module requires native Android/iOS modules unavailable under Jest.
const State = {
  None: 'none',
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Buffering: 'buffering',
  Loading: 'loading',
  Error: 'error',
  Ended: 'ended',
};

const Event = {
  PlaybackState: 'playback-state',
  PlaybackError: 'playback-error',
  PlaybackProgressUpdated: 'playback-progress-updated',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteStop: 'remote-stop',
  RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous',
  RemoteSeek: 'remote-seek',
  RemoteDuck: 'remote-duck',
};

const Capability = {
  Play: 'play',
  Pause: 'pause',
  Stop: 'stop',
  SeekTo: 'seek-to',
  SkipToNext: 'skip-to-next',
  SkipToPrevious: 'skip-to-previous',
};

const RatingType = { Heart: 'heart' };
const RepeatMode = { Off: 'off', Track: 'track', Queue: 'queue' };
const AppKilledPlaybackBehavior = { ContinuePlayback: 'continue', StopPlaybackAndRemoveNotification: 'stop' };

const TrackPlayer = {
  setupPlayer: jest.fn(() => Promise.resolve()),
  add: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
  skip: jest.fn(() => Promise.resolve()),
  skipToNext: jest.fn(() => Promise.resolve()),
  skipToPrevious: jest.fn(() => Promise.resolve()),
  play: jest.fn(() => Promise.resolve()),
  pause: jest.fn(() => Promise.resolve()),
  stop: jest.fn(() => Promise.resolve()),
  reset: jest.fn(() => Promise.resolve()),
  seekTo: jest.fn(() => Promise.resolve()),
  setVolume: jest.fn(() => Promise.resolve()),
  setRate: jest.fn(() => Promise.resolve()),
  getQueue: jest.fn(() => Promise.resolve([])),
  getActiveTrackIndex: jest.fn(() => Promise.resolve(null)),
  getActiveTrack: jest.fn(() => Promise.resolve(null)),
  getState: jest.fn(() => Promise.resolve(State.None)),
  getProgress: jest.fn(() => Promise.resolve({ position: 0, duration: 0, buffered: 0 })),
  updateNowPlayingMetadata: jest.fn(() => Promise.resolve()),
  updateOptions: jest.fn(() => Promise.resolve()),
  registerPlaybackService: jest.fn((factory) => factory),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

module.exports = {
  __esModule: true,
  default: TrackPlayer,
  State,
  Event,
  Capability,
  RatingType,
  RepeatMode,
  AppKilledPlaybackBehavior,
  useActiveTrack: jest.fn(() => null),
  usePlaybackState: jest.fn(() => ({ state: State.None })),
  useProgress: jest.fn(() => ({ position: 0, duration: 0, buffered: 0 })),
  useTrackPlayerEvents: jest.fn(),
};
