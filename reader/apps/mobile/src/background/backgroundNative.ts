import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * The phone-only half of the app: a periodic background sync and the app's
 * own notifications, neither of which a web app can do. Backed by
 * android/.../background/BackgroundModule.kt; every function here is a
 * no-op (or `false`) where that module isn't present, so the rest of the
 * app can call them unconditionally.
 */
interface BackgroundModule {
  scheduleSync(enabled: boolean, intervalHours: number): void;
  runSyncNow(): void;
  postNotification(kind: NotificationKind, title: string, body: string, deepLink: string | null): void;
  areNotificationsEnabled(): Promise<boolean>;
}

export type NotificationKind = 'newWeek' | 'downloadsReady';

/** How often the background sync wakes up. Every run is cheap when nothing changed - it re-checks what this week needs and queues only what's missing. */
export const BACKGROUND_SYNC_INTERVAL_HOURS = 6;

const DEEP_LINK_SCHEME = 'chassidushub://';

function nativeModule(): BackgroundModule | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.ChassidusHubBackground as BackgroundModule | undefined) ?? null;
}

export function isBackgroundSyncAvailable(): boolean {
  return nativeModule() !== null;
}

/** Registers (or cancels) the periodic sync - idempotent, safe on every launch. */
export function scheduleBackgroundSync(enabled: boolean): void {
  nativeModule()?.scheduleSync(enabled, BACKGROUND_SYNC_INTERVAL_HOURS);
}

export function runBackgroundSyncNow(): void {
  nativeModule()?.runSyncNow();
}

export function postNotification(kind: NotificationKind, title: string, body: string, deepLink: string | null): void {
  nativeModule()?.postNotification(kind, title, body, deepLink);
}

/** Whether a notification would actually show right now (permission granted on Android 13+, app not muted in system settings). */
export async function areNotificationsEnabled(): Promise<boolean> {
  const mod = nativeModule();
  if (!mod) return false;
  try {
    return await mod.areNotificationsEnabled();
  } catch {
    return false;
  }
}

/** Android 13+ asks the user; earlier versions only need the app not to be muted. Resolves to whether notifications can show. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return areNotificationsEnabled();
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Notification taps land on these (see `linking` in App.tsx and the manifest's intent filter). */
export function thisWeekDeepLink(sourceYear: number): string {
  return `${DEEP_LINK_SCHEME}this-week/${sourceYear}`;
}

export function downloadedDeepLink(): string {
  return `${DEEP_LINK_SCHEME}downloaded`;
}
