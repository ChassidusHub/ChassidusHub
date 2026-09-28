import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { occasionFullName, occasionTitle } from '@sichos-kodesh/app-core';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { useProgressMap } from '../player/useProgressMap';
import { useDownload } from '../download/useDownload';
import { useAllChaptersDownloadState } from '../download/useAllChaptersDownloadState';
import { isRtlLanguage, useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';
import { ChapterList } from '../components/ChapterList';
import { OccasionActions } from '../components/OccasionActions';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { formatDuration, totalDurationSeconds } from '../utils/formatDuration';

interface Props {
  resolved: ResolvedEntry;
}

/** A library item's recordings as one playlist (a farbrengen's are on its own page, FarbrengenScreen). */
export function RecordingsScreen({ resolved }: Props) {
  const { t, language } = useTranslation();
  const isRtl = isRtlLanguage(language);
  const progressMap = useProgressMap();
  const { downloadAllChapters } = useDownload();
  const allChaptersState = useAllChaptersDownloadState(resolved.entry);
  const { entry, basePath } = resolved;

  const totalDuration = formatDuration(totalDurationSeconds(entry.audio));
  // The playlist's own "download all" stays an icon in the header card, next
  // to the play button (the occasion page's bigger download pill would
  // repeat what this card already says); only Share sits below as a pill.
  let headerDownload = null;
  if (allChaptersState === 'downloaded') {
    headerDownload = (
      <span className="playlist-header-status" role="status" aria-label={t.downloadedLabel}>
        <CheckCircle2 size={18} className="download-state-done" aria-hidden />
      </span>
    );
  } else if (allChaptersState === 'downloading') {
    headerDownload = (
      <span className="playlist-header-status" role="status" aria-label={t.downloadingLabel}>
        <Loader2 size={18} className="download-state-spinner" aria-hidden />
      </span>
    );
  } else if (allChaptersState === 'none') {
    headerDownload = (
      <button
        type="button"
        className="playlist-header-action"
        onClick={() => downloadAllChapters(entry)}
        aria-label={t.downloadAllRecordingsLabel}
        title={t.downloadAllRecordingsLabel}
      >
        <Download size={18} aria-hidden />
      </button>
    );
  }
  // 'unavailable' deliberately renders no header action: while offline with
  // nothing cached yet, this page has no real aggregate download action to
  // offer.

  return (
    <div className="screen">
      <ScreenHeader to={basePath} title={occasionTitle(entry, language)} />
      <div className="playlist-header" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="playlist-header-main">
          <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
          <div className="playlist-header-copy">
            <p className="playlist-header-title">{occasionFullName(entry, language)}</p>
            <p className="playlist-header-subtitle">{totalDuration}</p>
          </div>
        </div>
        {headerDownload && <div className="playlist-header-side">{headerDownload}</div>}
      </div>

      <OccasionActions entry={entry} showDownload={false} />

      <ChapterList entry={entry} progressMap={progressMap} />
    </div>
  );
}
