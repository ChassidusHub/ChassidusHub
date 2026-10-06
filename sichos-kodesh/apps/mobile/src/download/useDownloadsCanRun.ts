import { useNetworkState } from '../network/networkState';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useOnlineMode } from '../appMode/appMode';
import { useDownload } from './useDownload';

/**
 * Whether a queued download can run now: the app is in online mode (offline
 * pack mode never downloads), there is a connection, and it is
 * Wi-Fi when downloads are set to Wi-Fi only (the default). Otherwise the
 * queue waits - Android holds the files until the network they need is
 * back - and nothing is shown as downloading: no progress bar, no
 * in-progress rows, no spinning row icons.
 */
export function useDownloadsCanRun(): boolean {
  const onlineMode = useOnlineMode();
  const online = useOnlineStatus();
  const { unmetered } = useNetworkState();
  const { settings } = useDownload();
  return onlineMode && online && (!settings.wifiOnly || unmetered);
}
