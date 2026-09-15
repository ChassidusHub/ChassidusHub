import { CheckCircle2, Download, Loader2, Music } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import { getOccasionProgress, isOccasionFinished } from '../player/progressStore';
import type { ProgressStore } from '../player/progressStore';
import { useDownload } from '../download/useDownload';
import { useDownloadState } from '../download/useDownloadState';
import { useTranslation } from '../i18n/useLanguage';

interface Props {
  entry: CatalogEntry;
  progressMap: ProgressStore;
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
export function OccasionRowIcon({ entry, progressMap }: Props) {
  const { t } = useTranslation();
  const { downloadOccasion } = useDownload();
  const downloadState = useDownloadState(entry);
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);

  let statusIcon = null;
  if (isOccasionFinished(progress, entry)) {
    // A finished checkmark takes priority over the plain audio-note icon - once you've heard it, that's the more useful thing to see at a glance.
    statusIcon = <CheckCircle2 size={14} className="finished-icon" aria-label={t.finishedLabel} />;
  } else if (entry.audio.length > 0) {
    statusIcon = <Music size={14} className="year-row-audio-icon" aria-label={t.hasRecordingLabel} />;
  }

  let downloadIcon = null;
  if (downloadState === 'downloaded') {
    downloadIcon = <CheckCircle2 size={14} className="download-state-done" aria-label={t.downloadedLabel} />;
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

  if (!statusIcon && !downloadIcon) return null;

  return (
    <span className="row-icons">
      {/* Download before the finished/audio icon - every occasion can be downloaded, but only some have a recording at all, so the always-relevant one leads. */}
      {downloadIcon}
      {statusIcon}
    </span>
  );
}
