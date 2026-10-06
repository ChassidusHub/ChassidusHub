import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useDownload } from '../download/useDownload';
import { getOfflineFolder, scanImportFolder, useOfflineStatus } from './offlineJobs';
import { getPacksNative } from './packsNative';

/**
 * Mounted once at the app root. On launch and whenever the app comes back
 * to the foreground (the station copies packs while the phone is plugged
 * in; the user unplugs and opens the app), everything in `import/` of the
 * shared folder is imported. When an import changes what is on the phone,
 * the download state refreshes so rows show the files as downloaded.
 */
export function useOfflineAutoImport(): void {
  const { refreshDownloads } = useDownload();
  const { filesVersion } = useOfflineStatus();
  const firstVersion = useRef(filesVersion);

  useEffect(() => {
    if (!getPacksNative()) return undefined;
    const scan = () => {
      getOfflineFolder()
        .then((folder) => (folder ? scanImportFolder() : undefined))
        .catch(() => undefined);
    };
    scan();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scan();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (filesVersion === firstVersion.current) return;
    refreshDownloads().catch(() => undefined);
  }, [filesVersion, refreshDownloads]);
}
