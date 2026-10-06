import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { readStoredNotificationSettings } from '../settings/notificationSettings';
import { requestNotificationPermission } from './backgroundNative';

const ASKED_KEY = 'chassidushub:notification-permission-asked';
/** The home comes up first; the invitation a moment after. */
const INVITE_DELAY_MS = 800;

/** Android 13+ has the phone's own question to ask; earlier versions allow notifications without one. */
function hasPermissionQuestion(): boolean {
  return Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33;
}

export interface NotificationInvite {
  visible: boolean;
  /** Yes: the phone's own question comes next. */
  allow: () => void;
  /** Not now: nothing more is asked; Settings asks again when a notification is turned on there. */
  later: () => void;
}

/**
 * Android 13+ only shows notifications after the user has said yes once.
 * The phone's own question never comes out of the blue: once setup is done
 * (`ready`: a mode chosen), the app first explains in its own dialog what it
 * would notify about (NotificationInvite), and only a yes there brings up
 * the phone's question. Offered a single time, while a notification is
 * switched on (they all default to on) and not already allowed.
 */
export function useNotificationInvite(ready: boolean): NotificationInvite {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ready || !hasPermissionQuestion()) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (await AsyncStorage.getItem(ASKED_KEY)) return;
      const settings = await readStoredNotificationSettings();
      if (!settings.newWeek && !settings.downloadsReady) return;
      if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) {
        await AsyncStorage.setItem(ASKED_KEY, '1');
        return;
      }
      if (alive) timer = setTimeout(() => alive && setVisible(true), INVITE_DELAY_MS);
    })().catch(() => undefined);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  const settle = useCallback((ask: boolean) => {
    setVisible(false);
    AsyncStorage.setItem(ASKED_KEY, '1').catch(() => undefined);
    if (ask) requestNotificationPermission().catch(() => undefined);
  }, []);

  return { visible, allow: useCallback(() => settle(true), [settle]), later: useCallback(() => settle(false), [settle]) };
}
