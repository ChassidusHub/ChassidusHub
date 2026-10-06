import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which of the app's own notifications the user wants (phone only - see
 * src/background). Held in one module-level store rather than per-hook
 * state so the Settings screen's toggles and the app shell's background
 * scheduling always see the same values.
 */
export interface NotificationSettings {
  /** Once per Hebrew week, when a new week begins: which year lines up with it and how many farbrengens it has. */
  newWeek: boolean;
  /** When the automatic sync has finished fetching this week's files. */
  downloadsReady: boolean;
}

const STORAGE_KEY = 'chassidushub:mobile-notification-settings';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { newWeek: true, downloadsReady: true };

let current: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
let hydrated = false;
let hydration: Promise<NotificationSettings> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function normalize(value: unknown): NotificationSettings {
  if (!value || typeof value !== 'object') return DEFAULT_NOTIFICATION_SETTINGS;
  const parsed = value as Partial<NotificationSettings>;
  return {
    newWeek: typeof parsed.newWeek === 'boolean' ? parsed.newWeek : DEFAULT_NOTIFICATION_SETTINGS.newWeek,
    downloadsReady: typeof parsed.downloadsReady === 'boolean' ? parsed.downloadsReady : DEFAULT_NOTIFICATION_SETTINGS.downloadsReady,
  };
}

/** Loads the persisted settings once (a value set before the load finishes wins over the stored one). */
export function readStoredNotificationSettings(): Promise<NotificationSettings> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!hydrated) {
          current = raw ? normalize(JSON.parse(raw)) : DEFAULT_NOTIFICATION_SETTINGS;
          hydrated = true;
          emit();
        }
        return current;
      })
      .catch(() => {
        hydrated = true;
        emit();
        return current;
      });
  }
  return hydration;
}

export function getNotificationSettings(): NotificationSettings {
  return current;
}

export function setNotificationSettings(next: NotificationSettings): void {
  current = next;
  hydrated = true;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
}

export function useNotificationSettings(): [NotificationSettings, (next: NotificationSettings) => void, boolean] {
  useEffect(() => {
    readStoredNotificationSettings().catch(() => undefined);
  }, []);
  const settings = useSyncExternalStore(subscribe, getNotificationSettings);
  const isHydrated = useSyncExternalStore(subscribe, () => hydrated);
  return [settings, setNotificationSettings, isHydrated];
}
