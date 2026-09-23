/**
 * downloadExecutor.ts
 *
 * Chooses between the native WorkManager downloader (Android) and the
 * existing RNBlobUtil foreground downloader based on runtime availability.
 *
 * The executor exposes a single `executeDownload` function that the
 * DownloadProvider calls for every target.  When native is available:
 *  - The download is enqueued into WorkManager (survives process death).
 *  - The returned promise resolves immediately with `{ mode: 'native' }`;
 *    the caller MUST listen to DeviceEventEmitter events to learn when
 *    the download completes or fails.
 *
 * When native is NOT available (Jest, future iOS path, missing module):
 *  - Falls back to the existing RNBlobUtil in-process download.
 *  - The returned promise resolves with `{ mode: 'foreground', localPath }`.
 */

import { DeviceEventEmitter } from 'react-native';
import { audioUrl } from './download';
import { downloadAudio as downloadAudioFile, downloadPdf as downloadPdfFile } from './download';
import type { DownloadProgress } from './download';
import type { DownloadTarget } from '@sichos-kodesh/app-core';
import { MEDIA_PROXY_BASE_URL } from '../config';
import {
  DOWNLOAD_CANCELED_EVENT,
  DOWNLOAD_COMPLETE_EVENT,
  DOWNLOAD_ERROR_EVENT,
  DOWNLOAD_PROGRESS_EVENT,
  isNativeDownloaderAvailable,
  nativeEnqueueDownload,
} from './nativeDownload';

export type DownloadMode = 'native' | 'foreground';

export interface ExecuteDownloadResult {
  mode: DownloadMode;
  /** Only present when mode === 'foreground'; undefined for native (async via events). */
  localPath?: string;
}

export interface NativeDownloadOptions {
  wifiOnly?: boolean;
  /** Part of the automatic sync's batch (tagged so the batch's last file can post the notice below). */
  auto?: boolean;
  /** Shown under the progress notification's title - the occasion's name. */
  label?: string;
  /** The progress notification's title, in the user's language. */
  progressTitle?: string;
  /** Posted, with a deep link, by whichever auto download of the batch finishes last. */
  notifyWhenDone?: { title: string; body: string; deepLink: string };
}

/** Hands one target to the native WorkManager downloader. Shared by the in-app queue and the headless background sync. */
export async function enqueueNativeDownload(target: DownloadTarget, options: NativeDownloadOptions = {}): Promise<void> {
  const metadata: Record<string, string> = {};
  if (options.wifiOnly) metadata.wifiOnly = 'true';
  if (options.auto) metadata.auto = 'true';
  if (options.label) metadata.label = options.label;
  if (options.progressTitle) metadata.progressTitle = options.progressTitle;
  if (options.notifyWhenDone) {
    metadata.notifyDone = 'true';
    metadata.doneTitle = options.notifyWhenDone.title;
    metadata.doneBody = options.notifyWhenDone.body;
    metadata.doneDeepLink = options.notifyWhenDone.deepLink;
  }
  await nativeEnqueueDownload(target.key, targetUrl(target), targetFilename(target), metadata);
}

/** Build the proxy download URL for a given target. */
function targetUrl(target: DownloadTarget): string {
  if (target.kind === 'audio') {
    return audioUrl(target.workerFilename ?? '');
  }
  const params = new URLSearchParams({ filename: `${target.driveFileId ?? target.key}.pdf` });
  if (target.resourceKey) params.set('resourcekey', target.resourceKey);
  return `${MEDIA_PROXY_BASE_URL}/drive/${target.driveFileId}?${params.toString()}`;
}

/** Build the destination filename for a given target (matches downloadStorage.fileNameForTarget). */
function targetFilename(target: DownloadTarget): string {
  return target.kind === 'audio'
    ? (target.workerFilename ?? `${target.key}.mp3`)
    : `${target.driveFileId ?? target.key}.pdf`;
}

/**
 * Execute a download for the given target.
 *
 * - When native WorkManager is available, the download is enqueued and the
 *   promise resolves with `{ mode: 'native' }`.  The caller must listen to
 *   DeviceEventEmitter for DOWNLOAD_COMPLETE_EVENT / DOWNLOAD_ERROR_EVENT.
 *
 * - Otherwise falls back to the foreground RNBlobUtil path and resolves with
 *   `{ mode: 'foreground', localPath }` once the file is fully written.
 */
export async function executeDownload(
  target: DownloadTarget,
  onProgress: (progress: number) => void,
  options?: NativeDownloadOptions,
): Promise<ExecuteDownloadResult> {
  if (isNativeDownloaderAvailable()) {
    await enqueueNativeDownload(target, options);
    return { mode: 'native' };
  }

  // Foreground fallback via RNBlobUtil
  const localPath = await runForegroundDownload(target, onProgress);
  return { mode: 'foreground', localPath };
}

async function runForegroundDownload(
  target: DownloadTarget,
  onProgress: (progress: number) => void,
): Promise<string> {
  const handleProgress = ({ received, total }: DownloadProgress) => {
    onProgress(total > 0 ? received / total : 0);
  };

  if (target.kind === 'audio') {
    return downloadAudioFile(target.workerFilename ?? '', handleProgress);
  }
  return downloadPdfFile(target.driveFileId ?? '', target.resourceKey ?? undefined, handleProgress);
}

// ── DeviceEventEmitter subscription helpers ───────────────────────────────────

export interface NativeDownloadProgressPayload {
  targetKey: string;
  bytesReceived: number;
  bytesTotal: number;
}

export interface NativeDownloadCompletePayload {
  targetKey: string;
  localPath: string;
}

export interface NativeDownloadCanceledPayload {
  targetKey: string;
}

export interface NativeDownloadErrorPayload {
  targetKey: string;
  error: string;
}

export function subscribeToNativeDownloadEvents(handlers: {
  onProgress?: (payload: NativeDownloadProgressPayload) => void;
  onComplete?: (payload: NativeDownloadCompletePayload) => void;
  onCanceled?: (payload: NativeDownloadCanceledPayload) => void;
  onError?: (payload: NativeDownloadErrorPayload) => void;
}): () => void {
  const subs = [
    handlers.onProgress
      ? DeviceEventEmitter.addListener(DOWNLOAD_PROGRESS_EVENT, handlers.onProgress)
      : null,
    handlers.onComplete
      ? DeviceEventEmitter.addListener(DOWNLOAD_COMPLETE_EVENT, handlers.onComplete)
      : null,
    handlers.onCanceled
      ? DeviceEventEmitter.addListener(DOWNLOAD_CANCELED_EVENT, handlers.onCanceled)
      : null,
    handlers.onError
      ? DeviceEventEmitter.addListener(DOWNLOAD_ERROR_EVENT, handlers.onError)
      : null,
  ].filter(Boolean);

  return () => {
    for (const sub of subs) sub?.remove();
  };
}
