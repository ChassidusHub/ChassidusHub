import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useTranslation } from '../i18n/useLanguage';
import { DownloadProgressRing } from './DownloadProgressRing';
import { ShareButton } from './ShareButton';

interface Props {
  entry: CatalogEntry;
  /** The recordings page keeps its own "download all" icon in the playlist header and shows only the Share pill here. */
  showDownload?: boolean;
}

/**
 * The action bar under an occasion's title: a Download pill and a Share
 * pill of the same shape, side by side. The download pill is the whole
 * state in one place - a button to start, then the live progress, then
 * "Downloaded" - instead of a text link next to a status line. The
 * recordings page renders the same bar with Share alone (its download
 * lives in the playlist header). The mobile app renders the same bar.
 */
export function OccasionActions({ entry, showDownload = true }: Props) {
  const { t } = useTranslation();
  const { downloadOccasion } = useDownload();
  const state = useDownloadState(entry);
  const progress = useDownloadProgress(entry);

  let download = null;
  if (!showDownload) {
    download = null;
  } else if (state === 'downloaded') {
    download = (
      <span className="action-pill action-pill-primary action-pill-static" role="status">
        <CheckCircle2 size={16} aria-hidden /> {t.downloadedLabel}
      </span>
    );
  } else if (state === 'downloading' || state === 'queued') {
    download = (
      <span className="action-pill action-pill-primary action-pill-static" role="status">
        {progress !== undefined ? <DownloadProgressRing size={16} progress={progress} /> : <Loader2 size={16} className="download-state-spinner" aria-hidden />} {t.downloadingLabel}
      </span>
    );
  } else if (state === 'none' || state === 'loading') {
    // 'loading' (the brief Cache Storage lookup) draws the same pill,
    // dimmed and inert, so the bar never pops in a moment after the page.
    download = (
      <button
        type="button"
        className={state === 'loading' ? 'action-pill action-pill-primary action-pill-pending' : 'action-pill action-pill-primary'}
        onClick={() => downloadOccasion(entry)}
        disabled={state === 'loading'}
      >
        <Download size={16} aria-hidden /> {t.downloadLabel}
      </button>
    );
  }
  // 'unavailable' (offline, nothing cached yet) shows no download pill at all - there is no real action to offer.

  return (
    <div className="action-bar">
      {download}
      <ShareButton title={entry.occasionLabel} />
    </div>
  );
}
