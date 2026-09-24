import { useNetworkState } from '../network/networkState';
import { useOnlineStatus } from '../network/useOnlineStatus';
import { useDownload } from './useDownload';

/**
 * Whether a queued download can run now: there is a connection, and it is
 * Wi-Fi when downloads are set to Wi-Fi only (the default). Otherwise the
 * queue waits - Android holds the files until the network they need is
 * back - and nothing is shown as downloading: no progress bar, no
 * in-progress rows, no spinning row icons.
 */
export function useDownloadsCanRun(): boolean {
  const online = useOnlineStatus();
  const { unmetered } = useNetworkState();
  const { settings } = useDownload();
  return online && (!settings.wifiOnly || unmetered);
}
