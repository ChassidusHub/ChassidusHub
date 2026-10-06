import type { ReactNode } from 'react';
import { CheckCircle2, Download, Loader2, Music } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { getOccasionProgress, isOccasionFinished } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import { useDownloadProgress } from '../download/useDownloadProgress';
import { useTranslation } from '../i18n/useLanguage';
import { DownloadProgressRing } from './DownloadProgressRing';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
  /**
   * A row's own trailing date (e.g. ThisWeekScreen's day+month), rendered
   * after all icons - download icon flush at the row's true outer edge,
   * then audio/finished status, then the date. Only when this is given do
   * the icons get fixed-width slots - blank when absent - so the gap
   * between the download button and the date stays constant whether or not
   * this occasion actually has audio, and every row's date starts at the
   * same screen position.
   */
  dateSlot?: ReactNode;
}

/**
 * The leading icon(s) on an occasion row, shared by every occasion list
 * (YearBrowserScreen, ThisWeekScreen, AllYearsThisWeekScreen, the home
 * page's Continue section, and more) so both "finished" and "downloaded"
 * read the same way everywhere a farbrengen can show up, not just on
 * whichever screen it was actually finished or downloaded from. This one
 * shared component is what makes every occasion individually downloadable
 * from anywhere, with live Spotify-style state (a plain arrow to start, a
 * spinner while queued/downloading, a filled check once done) - no
 * per-screen wiring needed beyond this file and DownloadProvider both
 * already being mounted.
 */
export function OccasionRowIcon({ entry, progressMap, dateSlot }: Props) {
  const { t } = useTranslation();
  const { downloadOccasion } = useDownload();
  const downloadState = useDownloadState(entry);
  const downloadProgress = useDownloadProgress(entry);
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);

  let statusIcon = null;
  if (isOccasionFinished(progress, entry)) {
    // A finished checkmark takes priority over the plain audio-note icon - once you've heard it, that's the more useful thing to see at a glance.
    statusIcon = <CheckCircle2 size={14} className="finished-icon" aria-label={t.finishedLabel} />;
  } else if (entry.audio.length > 0) {
    statusIcon = <Music size={14} className="year-row-audio-icon" aria-label={t.hasRecordingLabel} />;
  }

  let downloadIcon = null;
  if (downloadState === 'loading') {
    // The real Cache Storage check (useDownloadState) hasn't resolved yet -
    // a quiet placeholder here, not the eventual real icon popping in a
    // moment later out of nowhere, and not the same spinner 'downloading'
    // uses (this isn't an active download, just a lookup still in flight).
    downloadIcon = <span className="download-state-loading" aria-hidden />;
  } else if (downloadState === 'downloaded') {
    downloadIcon = <CheckCircle2 size={14} className="download-state-done" aria-label={t.downloadedLabel} />;
  } else if (downloadState === 'downloading' && downloadProgress !== undefined) {
    downloadIcon = (
      <span aria-label={t.downloadingLabel}>
        <DownloadProgressRing progress={downloadProgress} />
      </span>
    );
  } else if (downloadState === 'queued' || downloadState === 'downloading') {
    downloadIcon = <Loader2 size={14} className="download-state-spinner" aria-label={t.downloadingLabel} />;
  } else if (downloadState === 'none') {
    downloadIcon = (
      <button
        type="button"
        className="download-state-button"
        aria-label={t.downloadLabel}
        // Rows are otherwise a single clickable Link to the occasion itself
        // (see e.g. ThisWeekScreen) - stopping propagation here is what
        // keeps tapping this button from also navigating away.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          downloadOccasion(entry);
        }}
      >
        <Download size={14} />
      </button>
    );
  }

  if (dateSlot !== undefined) {
    return (
      <span className="row-icons">
        <span className="row-download-icon-slot">{downloadIcon}</span>
        <span className="row-status-icon-slot">{statusIcon}</span>
        {dateSlot}
      </span>
    );
  }

  if (!statusIcon && !downloadIcon) return null;

  return (
    <span className="row-icons">
      {/* Download after the finished/audio icon, so it sits flush at the
          row's true trailing edge (see .year-row-trailing's own comment) -
          the audio/finished icon is inner, next to it. */}
      {statusIcon}
      {downloadIcon}
    </span>
  );
}
