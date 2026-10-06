import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appFileUrl, compareVersions, fetchLatestAppRelease, pickAppFile, shouldPromptUpdate } from '@sichos-kodesh/app-core';
import type { AppReleaseFile, LatestAppRelease, UpdatePromptRecord } from '@sichos-kodesh/app-core';
import { getOnlineSnapshot } from '../network/connectivity';
import { APP_VERSION } from '../version';

/**
 * A newer version of the app: the app server (api.sk.chassidushub.org, which the
 * release workflow uploads each release to) says what the newest one is,
 * and the app asks once a launch whether to update - "Later" keeps that
 * version quiet for a few days (app-core's shouldPromptUpdate). Updating
 * opens the phone's own APK in the browser, which downloads it; opening
 * it installs it over this one. An app installed from Google Play is
 * updated by Play and never asked.
 */

const RECORD_KEY = 'sichos-kodesh:app-update-prompt';
const PLAY_INSTALLER = 'com.android.vending';

interface AppInfo {
  supportedAbis: string[];
  installer: string | null;
}

interface AppInfoModule {
  getInfo(): Promise<AppInfo>;
}

let info: Promise<AppInfo> | null = null;

/** The phone's ABIs and installer (android/.../appinfo/AppInfoModule.kt); arm64 and no installer where the module is missing. */
export function readAppInfo(): Promise<AppInfo> {
  if (!info) {
    const mod = NativeModules.SichosKodeshAppInfo as AppInfoModule | undefined;
    info = (mod ? mod.getInfo() : Promise.reject(new Error('no module'))).catch(() => ({ supportedAbis: ['arm64-v8a'], installer: null }));
  }
  return info;
}

export type AppUpdateStatus =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; release: LatestAppRelease; file: AppReleaseFile }
  | { phase: 'error' }
  /** Installed from Google Play: Play brings the updates. */
  | { phase: 'play' };

let status: AppUpdateStatus = { phase: 'idle' };
let inFlight: Promise<AppUpdateStatus> | null = null;
const listeners = new Set<() => void>();

function setStatus(next: AppUpdateStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

/** Asks the app server for the newest release. Concurrent calls share one run; never throws. */
export function checkForAppUpdate(): Promise<AppUpdateStatus> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { supportedAbis, installer } = await readAppInfo();
    if (installer === PLAY_INSTALLER) {
      setStatus({ phase: 'play' });
      return status;
    }
    setStatus({ phase: 'checking' });
    const release = await fetchLatestAppRelease();
    const file = release ? pickAppFile(release, supportedAbis) : null;
    if (!release || !file) setStatus({ phase: 'error' });
    else if (compareVersions(release.version, APP_VERSION) > 0) setStatus({ phase: 'available', release, file });
    else setStatus({ phase: 'up-to-date' });
    return status;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppUpdateStatus(): AppUpdateStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  );
}

async function readRecord(): Promise<UpdatePromptRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(RECORD_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<UpdatePromptRecord>) : null;
    return parsed && typeof parsed.version === 'string' && typeof parsed.dismissedAt === 'number' ? { version: parsed.version, dismissedAt: parsed.dismissedAt } : null;
  } catch {
    return null;
  }
}

async function writeRecord(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RECORD_KEY, JSON.stringify({ version, dismissedAt: Date.now() } satisfies UpdatePromptRecord));
  } catch {
    // Best-effort: at worst the question comes again next launch.
  }
}

/** Downloads the APK in the browser; the phone installs it from there. */
export function openAppUpdate(file: AppReleaseFile): void {
  Linking.openURL(appFileUrl(file)).catch(() => undefined);
}

/**
 * The launch question, mounted once at the root. `enabled` holds it back
 * while anything else is on screen first (the mode chooser, the
 * notification invite).
 */
export function useAppUpdatePrompt(enabled: boolean): { visible: boolean; release: LatestAppRelease | null; file: AppReleaseFile | null; update: () => void; later: () => void } {
  const [prompt, setPrompt] = useState<{ release: LatestAppRelease; file: AppReleaseFile } | null>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (!enabled || asked) return;
    setAsked(true);
    if (!getOnlineSnapshot()) return;
    let cancelled = false;
    (async () => {
      const result = await checkForAppUpdate();
      if (result.phase !== 'available') return;
      if (!shouldPromptUpdate(result.release, APP_VERSION, await readRecord())) return;
      if (!cancelled) setPrompt({ release: result.release, file: result.file });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, asked]);

  const close = useCallback(() => {
    if (prompt) writeRecord(prompt.release.version).catch(() => undefined);
    setPrompt(null);
  }, [prompt]);

  const update = useCallback(() => {
    if (prompt) openAppUpdate(prompt.file);
    close();
  }, [prompt, close]);

  return { visible: prompt !== null, release: prompt?.release ?? null, file: prompt?.file ?? null, update, later: close };
}
