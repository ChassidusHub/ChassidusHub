import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { DownloadProvider } from './DownloadProvider';
import { useDownload } from './useDownload';
import type { DownloadContextValue } from './downloadContext';
import type {
  NativeDownloadCanceledPayload,
  NativeDownloadErrorPayload,
  NativeDownloadProgressPayload,
} from './downloadExecutor';

let latestContext: DownloadContextValue | null = null;
let appStateListener: ((state: string) => void) | null = null;
let nativeHandlers: {
  onProgress?: (payload: NativeDownloadProgressPayload) => void;
  onComplete?: (payload: { targetKey: string; localPath: string }) => void;
  onCanceled?: (payload: NativeDownloadCanceledPayload) => void;
  onError?: (payload: NativeDownloadErrorPayload) => void;
} | null = null;

const mockDefaultDownloadSettings = {
  autoDownloadEnabled: false,
  wifiOnly: true,
  manualDownloadAllContent: true,
  contentTypes: {
    audio: true,
    hanachaEditions: ['sichosKodesh', 'torasMenachem'] as const,
    mugah: false,
    maamorim: false,
    hagahos: false,
    hosofos: false,
  },
};

const mockExecuteDownload = jest.fn();
const mockListActiveNativeDownloads = jest.fn();
const mockNativeCancelDownload = jest.fn();
const mockReconcileStoredDownloads = jest.fn();
const mockUpsertStoredDownload = jest.fn();
const mockListPendingDownloads = jest.fn();
const mockWritePendingDownloads = jest.fn();
const mockIsTargetDownloaded = jest.fn();

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(
      (_type: string, handler: (state: string) => void) => {
        appStateListener = handler;
        return {
          remove: jest.fn(() => {
            appStateListener = null;
          }),
        };
      },
    ),
  },
  // LanguageProvider (wrapping the provider under test) and the background
  // module wrapper touch these; none of the tests care what they do.
  I18nManager: { allowRTL: jest.fn() },
  NativeModules: {},
  PermissionsAndroid: { request: jest.fn(), PERMISSIONS: {}, RESULTS: {} },
  Platform: { OS: 'android', Version: 34 },
}));

jest.mock('../catalog/data', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('./downloadSettings', () => ({
  DEFAULT_DOWNLOAD_SETTINGS: mockDefaultDownloadSettings,
  useDownloadSettings: jest.fn(() => [
    mockDefaultDownloadSettings,
    jest.fn(),
    true,
  ]),
}));

jest.mock('./downloadStorage', () => ({
  clearAllDownloadedFiles: jest.fn(() => Promise.resolve()),
  clearPendingDownloads: jest.fn(() => Promise.resolve()),
  deleteEntryDownloads: jest.fn(() => Promise.resolve()),
  isTargetDownloaded: (...args: unknown[]) => mockIsTargetDownloaded(...args),
  listDownloadedOccasions: jest.fn(() => Promise.resolve([])),
  listPendingDownloads: (...args: unknown[]) =>
    mockListPendingDownloads(...args),
  localPathForTarget: (target: DownloadTarget) => `/documents/${target.key}`,
  reconcileStoredDownloads: (...args: unknown[]) =>
    mockReconcileStoredDownloads(...args),
  upsertStoredDownload: (...args: unknown[]) =>
    mockUpsertStoredDownload(...args),
  writePendingDownloads: (...args: unknown[]) =>
    mockWritePendingDownloads(...args),
}));

jest.mock('./downloadExecutor', () => ({
  executeDownload: (...args: unknown[]) => mockExecuteDownload(...args),
  subscribeToNativeDownloadEvents: jest.fn(handlers => {
    nativeHandlers = handlers;
    return () => {
      nativeHandlers = null;
    };
  }),
}));

jest.mock('./nativeDownload', () => ({
  listActiveNativeDownloads: (...args: unknown[]) =>
    mockListActiveNativeDownloads(...args),
  nativeCancelDownload: (...args: unknown[]) =>
    mockNativeCancelDownload(...args),
}));

function Probe() {
  latestContext = useDownload();
  return null;
}

const target: DownloadTarget = {
  key: 'audio-5786-1-0',
  hebrewYear: 5786,
  occasionId: 1,
  label: 'Test Occasion',
  kind: 'audio',
  chapterIndex: 0,
  workerFilename: 'test.mp3',
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('DownloadProvider native cancellation reconciliation', () => {
  beforeEach(() => {
    latestContext = null;
    appStateListener = null;
    nativeHandlers = null;
    jest.clearAllMocks();
    mockExecuteDownload.mockResolvedValue({ mode: 'native' });
    mockListActiveNativeDownloads.mockResolvedValue([]);
    mockNativeCancelDownload.mockResolvedValue(undefined);
    mockReconcileStoredDownloads.mockResolvedValue([]);
    mockUpsertStoredDownload.mockResolvedValue([]);
    mockListPendingDownloads.mockResolvedValue([]);
    mockWritePendingDownloads.mockResolvedValue(undefined);
    mockIsTargetDownloaded.mockResolvedValue(false);
  });

  it('maps notification-driven native cancellation to canceled state', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LanguageProvider>
          <DownloadProvider>
            <Probe />
          </DownloadProvider>
        </LanguageProvider>,
      );
    });
    await flush();

    await act(async () => {
      await latestContext!.enqueueTargets([target]);
    });
    await flush();

    expect(latestContext!.targetStates[target.key]?.status).toBe('downloading');

    await act(async () => {
      nativeHandlers?.onCanceled?.({ targetKey: target.key });
    });

    expect(latestContext!.targetStates[target.key]?.status).toBe('canceled');
    expect(mockUpsertStoredDownload).not.toHaveBeenCalled();

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('reconciles stale native pending work to canceled on app foreground', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LanguageProvider>
          <DownloadProvider>
            <Probe />
          </DownloadProvider>
        </LanguageProvider>,
      );
    });
    await flush();

    mockListActiveNativeDownloads.mockResolvedValueOnce([]);
    await act(async () => {
      await latestContext!.enqueueTargets([target]);
    });
    await flush();

    expect(latestContext!.targetStates[target.key]?.status).toBe('downloading');

    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
    });
    await flush();

    expect(latestContext!.targetStates[target.key]?.status).toBe('canceled');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('still reports actual native failures as error', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LanguageProvider>
          <DownloadProvider>
            <Probe />
          </DownloadProvider>
        </LanguageProvider>,
      );
    });
    await flush();

    await act(async () => {
      await latestContext!.enqueueTargets([target]);
    });
    await flush();

    await act(async () => {
      nativeHandlers?.onError?.({
        targetKey: target.key,
        error: 'network failed',
      });
    });

    expect(latestContext!.targetStates[target.key]?.status).toBe('error');
    expect(latestContext!.targetStates[target.key]?.error).toBe(
      'network failed',
    );

    await act(async () => {
      renderer!.unmount();
    });
  });
});
