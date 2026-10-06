import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import { useAllChaptersDownloadState } from '../download/useAllChaptersDownloadState';
import { useDownload } from '../download/useDownload';
import { useTranslation } from '../i18n/useLanguage';

/**
 * Every recording of one entry, saved at once: an icon on its recordings'
 * card, next to Play (a library item's page). Shows what is under way or
 * done; offline with nothing saved yet, there is nothing to offer.
 */
export function DownloadAllChapters({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation();
  const { downloadAllChapters } = useDownload();
  const state = useAllChaptersDownloadState(entry);
  if (state === 'downloaded')
    return (
      <span className="playlist-header-status" role="status" aria-label={t.downloadedLabel}>
        <CheckCircle2 size={18} className="download-state-done" aria-hidden />
      </span>
    );
  if (state === 'downloading')
    return (
      <span className="playlist-header-status" role="status" aria-label={t.downloadingLabel}>
        <Loader2 size={18} className="download-state-spinner" aria-hidden />
      </span>
    );
  if (state === 'none')
    return (
      <button type="button" className="playlist-header-action" onClick={() => downloadAllChapters(entry)} aria-label={t.downloadAllRecordingsLabel} title={t.downloadAllRecordingsLabel}>
        <Download size={18} aria-hidden />
      </button>
    );
  return null;
}
