import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { readStoredNotificationSettings } from '../settings/notificationSettings';
import { requestNotificationPermission } from './backgroundNative';

const ASKED_KEY = 'sichos-kodesh:notification-permission-asked';

/**
 * Android 13+ only shows notifications after the user has said yes once.
 * Asked a single time, on the first launch that has any notification
 * switched on (they all default to on); turning one on later in Settings
 * asks again there if it was refused.
 */
export function useNotificationPermissionOnLaunch(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      if (await AsyncStorage.getItem(ASKED_KEY)) return;
      const settings = await readStoredNotificationSettings();
      if (!settings.newWeek && !settings.downloadsReady) return;
      await AsyncStorage.setItem(ASKED_KEY, '1');
      await requestNotificationPermission();
    })().catch(() => undefined);
  }, []);
}
