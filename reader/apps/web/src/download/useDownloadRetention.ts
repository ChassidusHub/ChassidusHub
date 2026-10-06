import { useEffect } from 'react';
import { pruneAutoDownloads } from './pruneAutoDownloads';
import { useDownload } from './useDownload';

/**
 * Mounted once in AppContent, alongside useAutoDownloadSync - runs once per
 * app open, not on every navigation or settings change (a mid-session
 * retention-period change should apply on the *next* open, matching
 * useAutoDownloadSync's own reasoning). Kept as its own hook rather than
 * folded into useAutoDownloadSync itself: one concern (fetch what's
 * missing) and the other (delete what's stale) are logically independent,
 * even though both only ever run at the same moment.
 */
export function useDownloadRetention(): void {
  const { settings } = useDownload();

  useEffect(() => {
    void pruneAutoDownloads(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per app load, same reasoning as useAutoDownloadSync.
  }, []);
}
