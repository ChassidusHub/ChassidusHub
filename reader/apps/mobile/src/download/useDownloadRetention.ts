import { useEffect, useRef } from 'react';
import { hydrateProgressStore } from '../player/progressStore';
import { hydrateAutoDownloadLedger } from './downloadLedger';
import { pruneAutoDownloads } from './pruneAutoDownloads';
import { useDownload } from './useDownload';

/** Mounted once at the app root, alongside useAutoDownloadSync - runs once per app open, once the persisted settings, ledger and progress store have all loaded. */
export function useDownloadRetention(): void {
  const { settings, hydrated, refreshDownloads } = useDownload();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!hydrated || ranRef.current) return;
    ranRef.current = true;
    Promise.all([hydrateAutoDownloadLedger(), hydrateProgressStore()])
      .then(() => pruneAutoDownloads(settings))
      .then(() => refreshDownloads())
      .catch(() => undefined);
  }, [hydrated, refreshDownloads, settings]);
}
