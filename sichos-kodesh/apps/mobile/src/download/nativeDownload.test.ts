/**
 * Tests for nativeDownload.ts and downloadExecutor.ts.
 *
 * All native modules and RNBlobUtil are mocked so these run cleanly in Jest
 * without any Android runtime.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
  DeviceEventEmitter: {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    emit: jest.fn(),
  },
}));

jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { DocumentDir: '/documents' },
    exists: jest.fn(() => Promise.resolve(false)),
    mv: jest.fn(() => Promise.resolve()),
  },
  config: jest.fn(() => ({
    fetch: jest.fn(() => ({
      progress: jest.fn().mockReturnThis(),
      then: jest.fn((cb: (r: { path: () => string }) => unknown) => cb({ path: () => '/documents/test.part' })),
    })),
  })),
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('nativeDownload', () => {
  beforeEach(() => {
    jest.resetModules();
    // Reset NativeModules between tests
    const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown>; Platform: { OS: string } };
    rn.NativeModules = {};
    rn.Platform.OS = 'android';
  });

  it('returns null when SichosKodeshDownloader is absent (Jest)', () => {
    const { getNativeDownloader } = require('./nativeDownload') as typeof import('./nativeDownload');
    expect(getNativeDownloader()).toBeNull();
  });

  it('isNativeDownloaderAvailable returns false when module missing', () => {
    const { isNativeDownloaderAvailable } = require('./nativeDownload') as typeof import('./nativeDownload');
    expect(isNativeDownloaderAvailable()).toBe(false);
  });

  it('returns null when Platform.OS is not android', () => {
    const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown>; Platform: { OS: string } };
    rn.Platform.OS = 'ios';
    const { getNativeDownloader } = require('./nativeDownload') as typeof import('./nativeDownload');
    expect(getNativeDownloader()).toBeNull();
  });

  it('returns module when SichosKodeshDownloader is present on android', () => {
    const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown>; Platform: { OS: string } };
    rn.Platform.OS = 'android';
    rn.NativeModules.SichosKodeshDownloader = {
      enqueueDownload: jest.fn(),
      cancelDownload: jest.fn(),
      getFilesDir: jest.fn(),
    };
    const { getNativeDownloader, isNativeDownloaderAvailable } = require('./nativeDownload') as typeof import('./nativeDownload');
    expect(getNativeDownloader()).not.toBeNull();
    expect(isNativeDownloaderAvailable()).toBe(true);
  });

  it('nativeEnqueueDownload throws when module unavailable', async () => {
    const { nativeEnqueueDownload } = require('./nativeDownload') as typeof import('./nativeDownload');
    await expect(nativeEnqueueDownload('key', 'http://x', 'x.mp3')).rejects.toThrow(
      'Native downloader is not available',
    );
  });

  it('nativeCancelDownload is a no-op when module unavailable', async () => {
    const { nativeCancelDownload } = require('./nativeDownload') as typeof import('./nativeDownload');
    await expect(nativeCancelDownload('key')).resolves.toBeUndefined();
  });

  it('getNativeFilesDir returns null when module unavailable', async () => {
    const { getNativeFilesDir } = require('./nativeDownload') as typeof import('./nativeDownload');
    await expect(getNativeFilesDir()).resolves.toBeNull();
  });
});

describe('downloadExecutor — foreground fallback', () => {
  beforeEach(() => {
    jest.resetModules();
    const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown>; Platform: { OS: string } };
    rn.NativeModules = {};
    rn.Platform.OS = 'android';
  });

  it('uses foreground path when native module is absent', async () => {
    // Provide a working RNBlobUtil mock that resolves a path
    const rnbu = jest.requireMock('react-native-blob-util') as {
      fs: { mv: jest.Mock; dirs: { DocumentDir: string }; exists: jest.Mock };
      config: jest.Mock;
    };
    rnbu.fs.exists.mockResolvedValue(false);
    rnbu.config.mockReturnValue({
      fetch: jest.fn(() => ({
        progress: jest.fn().mockReturnThis(),
        // Return a promise-like that resolves with a path() method
        then: (cb: (r: { path: () => string }) => unknown) => Promise.resolve(cb({ path: () => '/documents/a.mp3.part' })),
      })),
    });

    const { executeDownload } = require('./downloadExecutor') as typeof import('./downloadExecutor');
    const audioTarget = {
      key: 'audio-1',
      hebrewYear: 5784,
      occasionId: 1,
      label: 'Test',
      kind: 'audio' as const,
      chapterIndex: 0,
      workerFilename: 'a.mp3',
    };
    const result = await executeDownload(audioTarget, jest.fn());
    expect(result.mode).toBe('foreground');
  });

  it('routes through native when SichosKodeshDownloader is present', async () => {
    const mockEnqueue = jest.fn().mockResolvedValue({ targetKey: 'audio-1', workId: 'uuid-1' });
    const rn = jest.requireMock('react-native') as { NativeModules: Record<string, unknown>; Platform: { OS: string } };
    rn.Platform.OS = 'android';
    rn.NativeModules.SichosKodeshDownloader = {
      enqueueDownload: mockEnqueue,
      cancelDownload: jest.fn(),
      getFilesDir: jest.fn(),
    };

    const { executeDownload } = require('./downloadExecutor') as typeof import('./downloadExecutor');
    const audioTarget = {
      key: 'audio-1',
      hebrewYear: 5784,
      occasionId: 1,
      label: 'Test',
      kind: 'audio' as const,
      chapterIndex: 0,
      workerFilename: 'a.mp3',
    };
    const result = await executeDownload(audioTarget, jest.fn());
    expect(result.mode).toBe('native');
    expect(result.localPath).toBeUndefined();
    expect(mockEnqueue).toHaveBeenCalledWith('audio-1', expect.stringContaining('a.mp3'), 'a.mp3', null);
  });
});

describe('subscribeToNativeDownloadEvents', () => {
  beforeEach(() => {
    jest.resetModules();
    const rn = jest.requireMock('react-native') as {
      NativeModules: Record<string, unknown>;
      Platform: { OS: string };
      DeviceEventEmitter: { addListener: jest.Mock };
    };
    rn.NativeModules = {};
    rn.Platform.OS = 'android';
    rn.DeviceEventEmitter.addListener.mockClear();
  });

  it('registers listeners for all three event types', () => {
    const rn = jest.requireMock('react-native') as {
      DeviceEventEmitter: { addListener: jest.Mock };
    };
    const { subscribeToNativeDownloadEvents } = require('./downloadExecutor') as typeof import('./downloadExecutor');
    const unsubscribe = subscribeToNativeDownloadEvents({
      onProgress: jest.fn(),
      onComplete: jest.fn(),
      onError: jest.fn(),
    });
    expect(rn.DeviceEventEmitter.addListener).toHaveBeenCalledTimes(3);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('removes subscriptions when unsubscribe is called', () => {
    const removeMock = jest.fn();
    const rn = jest.requireMock('react-native') as {
      DeviceEventEmitter: { addListener: jest.Mock };
    };
    rn.DeviceEventEmitter.addListener.mockReturnValue({ remove: removeMock });
    const { subscribeToNativeDownloadEvents } = require('./downloadExecutor') as typeof import('./downloadExecutor');
    const unsubscribe = subscribeToNativeDownloadEvents({ onProgress: jest.fn() });
    unsubscribe();
    expect(removeMock).toHaveBeenCalled();
  });
});
