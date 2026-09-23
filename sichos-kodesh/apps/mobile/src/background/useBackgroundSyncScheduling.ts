import { useEffect } from 'react';
import { useDownload } from '../download/useDownload';
import { useNotificationSettings } from '../settings/notificationSettings';
import { scheduleBackgroundSync } from './backgroundNative';

/**
 * Keeps the periodic background sync registered exactly when something
 * needs it: the automatic download's "also when the app is closed" option,
 * or the weekly notification (which is decided by the same task). Runs on
 * every launch, so a reinstall or a cleared WorkManager queue heals itself.
 */
export function useBackgroundSyncScheduling(): void {
  const { settings, hydrated } = useDownload();
  const [notifications, , notificationsHydrated] = useNotificationSettings();

  useEffect(() => {
    if (!hydrated || !notificationsHydrated) return;
    scheduleBackgroundSync((settings.autoDownloadEnabled && settings.backgroundSyncEnabled) || notifications.newWeek);
  }, [hydrated, notifications.newWeek, notificationsHydrated, settings.autoDownloadEnabled, settings.backgroundSyncEnabled]);
}
