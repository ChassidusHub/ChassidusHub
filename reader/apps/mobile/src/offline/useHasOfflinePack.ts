import { useEffect, useState } from 'react';
import { readInstalledPacks } from './objectStore';
import { useOfflineStatus } from './offlineJobs';

/**
 * Whether a pack has been imported on this phone: true once one has, false
 * while none has, null until the record has been read (so nothing flashes
 * in on start). Read again whenever an import changes what is on the phone.
 * The app is meant to work offline, and with a pack on the phone it does:
 * it no longer says so when there is no connection (ConnectivityBanner,
 * the home screen).
 */
export function useHasOfflinePack(): boolean | null {
  const { filesVersion } = useOfflineStatus();
  const [hasPack, setHasPack] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    readInstalledPacks()
      .then((packs) => live && setHasPack(packs.length > 0))
      .catch(() => live && setHasPack(false));
    return () => {
      live = false;
    };
  }, [filesVersion]);
  return hasPack;
}
