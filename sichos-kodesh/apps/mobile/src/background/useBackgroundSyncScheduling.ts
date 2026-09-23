import { useEffect } from 'react';
import { useDownload } from '../download/useDownload';
import { useNotificationSettings } from '../settings/notificationSettings';
import { scheduleBackgroundSync } from './backgroundNative';

/**
 * Keeps the periodic background sync registered exactly when something
 * needs it: the automatic download (which on the phone always includes
 * running while the app is closed - it is one switch, not two), or the
 * weekly notification (decided by the same task). Runs on every launch,
 * so a reinstall or a cleared WorkManager queue heals itself.
 */
export function useBackgroundSyncScheduling(): void {
  const { settings, hydrated } = useDownload();
  const [notifications, , notificationsHydrated] = useNotificationSettings();

  useEffect(() => {
    if (!hydrated || !notificationsHydrated) return;
    scheduleBackgroundSync(settings.autoDownloadEnabled || notifications.newWeek);
  }, [hydrated, notifications.newWeek, notificationsHydrated, settings.autoDownloadEnabled]);
}
