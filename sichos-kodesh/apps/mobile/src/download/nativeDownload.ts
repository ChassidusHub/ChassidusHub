/**
 * nativeDownload.ts
 *
 * Thin wrapper around the Android `SichosKodeshDownloader` native module.
 *
 * On Android at runtime: routes downloads through WorkManager via the native module.
 * In Jest / non-Android environments: falls back safely to a no-op or the caller's
 * own fallback (the DownloadProvider continues to use the RNBlobUtil foreground path).
 *
 * Event constants (re-exported so callers don't hard-code strings):
 *   DOWNLOAD_PROGRESS_EVENT  → { targetKey, bytesReceived, bytesTotal }
 *   DOWNLOAD_COMPLETE_EVENT  → { targetKey, localPath }
 *   DOWNLOAD_ERROR_EVENT     → { targetKey, error }
 */

import { NativeModules, Platform } from 'react-native';

export const DOWNLOAD_PROGRESS_EVENT = 'SichosKodeshDownloadProgress';
export const DOWNLOAD_COMPLETE_EVENT = 'SichosKodeshDownloadComplete';
export const DOWNLOAD_ERROR_EVENT = 'SichosKodeshDownloadError';

export interface NativeEnqueueResult {
  targetKey: string;
  workId: string;
}

export interface NativeDownloadModule {
  enqueueDownload(
    targetKey: string,
    url: string,
    filename: string,
    metadata: Record<string, string> | null,
  ): Promise<NativeEnqueueResult>;
  cancelDownload(targetKey: string): Promise<void>;
  getFilesDir(): Promise<string>;
}

/**
 * Returns the native download module if available (Android runtime only).
 * Returns null in Jest, web, iOS (future), or when the module is not yet linked.
 */
export function getNativeDownloader(): NativeDownloadModule | null {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.SichosKodeshDownloader as NativeDownloadModule | undefined;
  return mod ?? null;
}

/**
 * Returns true when the native WorkManager downloader is available in the
 * current runtime environment.
 */
export function isNativeDownloaderAvailable(): boolean {
  return getNativeDownloader() !== null;
}

/**
 * Enqueue a download through the native WorkManager bridge.
 * Throws if the native module is unavailable — callers should check
 * `isNativeDownloaderAvailable()` first or catch the error.
 */
export async function nativeEnqueueDownload(
  targetKey: string,
  url: string,
  filename: string,
  metadata?: Record<string, string> & { wifiOnly?: string },
): Promise<NativeEnqueueResult> {
  const mod = getNativeDownloader();
  if (!mod) throw new Error('Native downloader is not available in this environment');
  return mod.enqueueDownload(targetKey, url, filename, metadata ?? null);
}

/**
 * Cancel a queued or running download by target key.
 * No-op if the native module is unavailable.
 */
export async function nativeCancelDownload(targetKey: string): Promise<void> {
  const mod = getNativeDownloader();
  if (!mod) return;
  return mod.cancelDownload(targetKey);
}

/**
 * Returns the absolute path to the app's internal files directory on Android.
 * Returns null when native module is unavailable.
 */
export async function getNativeFilesDir(): Promise<string | null> {
  const mod = getNativeDownloader();
  if (!mod) return null;
  return mod.getFilesDir();
}
