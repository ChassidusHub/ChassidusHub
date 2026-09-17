import { CheckCircle2, Download, Loader2, Pause, Play } from 'lucide-react';
import type { CatalogEntry } from '@sichos-kodesh/catalog';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { usePlayer } from '../player/usePlayer';
import type { PlayerContextValue } from '../player/playerContext';
import { chapterProgressFraction, getOccasionProgress, isChapterFinished } from '../player/progressStore';
import type { OccasionProgress } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { useChapterDownload } from '../download/useChapterDownload';
import { useDownload } from '../download/useDownload';
import { useAllChaptersDownloadState } from '../download/useAllChaptersDownloadState';
import { isRtlLanguage, useTranslation } from '../i18n/useLanguage';
import { ScreenHeader } from '../components/ScreenHeader';
import { DownloadProgressRing } from '../components/DownloadProgressRing';
import { ShareButton } from '../components/ShareButton';
import { PlaylistPlayButton } from '../components/PlaylistPlayButton';
import { formatDuration, totalDurationSeconds } from '../utils/formatDuration';

interface Props {
  resolved: ResolvedEntry;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface PlaylistRowProps {
  entry: CatalogEntry;
  index: number;
  isActive: boolean;
  player: PlayerContextValue;
  progress: OccasionProgress | undefined;
}

/**
 * Its own component, not inlined in the `.map()` below, because it calls
 * `useChapterDownload` - one hook instance per row needs a stable
 * component identity per row, not a loop body.
 */
function PlaylistRow({ entry, index, isActive, player, progress }: PlaylistRowProps) {
  const { t } = useTranslation();
  const chapter = entry.audio[index]!;
  const download = useChapterDownload(entry, index);
  const finished = !isActive && isChapterFinished(progress, index, chapter);
  // The active row's fraction comes from the player's live
  // currentTime/duration, not the localStorage snapshot (which only
  // advances on PlayerProvider's throttled ~3s writes) - this is what
  // keeps the playing row's bar updating smoothly in real time.
  const fraction = isActive
    ? player.duration > 0
      ? Math.min(player.currentTime / player.duration, 1)
      : 0
    : finished
      ? 0
      : chapterProgressFraction(progress, index, chapter);

  let downloadIcon = null;
  if (download.state === 'loading') {
    downloadIcon = <span className="download-state-loading" aria-hidden />;
  } else if (download.state === 'downloaded') {
    downloadIcon = <CheckCircle2 size={14} className="download-state-done" aria-label={t.downloadedLabel} />;
  } else if (download.state === 'downloading' && download.progress !== undefined) {
    downloadIcon = (
      <span aria-label={t.downloadingLabel}>
        <DownloadProgressRing progress={download.progress} />
      </span>
    );
  } else if (download.state === 'queued' || download.state === 'downloading') {
    downloadIcon = <Loader2 size={14} className="download-state-spinner" aria-label={t.downloadingLabel} />;
  } else if (download.state === 'none') {
    downloadIcon = (
      <button type="button" className="download-state-button" aria-label={t.downloadLabel} onClick={() => download.download()}>
        <Download size={14} />
      </button>
    );
  }

  return (
    <li className="playlist-row-item">
      <button
        className={isActive ? 'playlist-row playlist-row-active' : 'playlist-row'}
        onClick={() => {
          // Resumes from wherever this chapter was left off, not always
          // from 0. Auto-advance (PlayerProvider's own `next()` on
          // `onEnded`) is untouched by this and still starts its chapter
          // at 0 - that's a fresh chapter, not one someone chose to resume.
          const savedPosition = progress?.chapters[index]?.position ?? 0;
          player.play(
            { title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId, hebrewDate: entry.hebrewDate },
            index,
            savedPosition,
          );
        }}
      >
        <span className="playlist-row-icon">
          {isActive && player.loading ? (
            <Loader2 size={16} className="player-loading-spinner" aria-label={t.loading} />
          ) : isActive && player.playing ? (
            // strokeWidth={0}: lucide draws a 2px stroke outline even on a
            // filled icon by default, which noticeably over-thickens Pause's
            // two already-solid bars at this row's small size.
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          ) : finished ? (
            <CheckCircle2 size={16} className="finished-icon" aria-label={t.finishedLabel} />
          ) : (
            <Play size={16} fill="currentColor" strokeWidth={0} />
          )}
        </span>
        <span className="playlist-row-name">{chapter.chapterName ?? t.track(index + 1)}</span>
        {/* Always rendered, even at 0%, so every row reserves the same
            space - conditionally rendering it would shift other rows'
            layout depending on whether this row happens to have progress. */}
        <span className="playlist-row-progress-track" aria-hidden>
          <span className="playlist-row-progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
        <span className="playlist-row-duration">{formatTime(chapter.durationMs / 1000)}</span>
      </button>
      {/* Independent of the whole occasion's download state
          (FarbrengenScreen) - this is a single recording's own download
          affordance. */}
      <span className="row-icons">{downloadIcon}</span>
    </li>
  );
}

export function RecordingsScreen({ resolved }: Props) {
  const { t, language } = useTranslation();
  const isRtl = isRtlLanguage(language);
  const player = usePlayer();
  const progressMap = useProgressMap();
  const { downloadAllChapters } = useDownload();
  const allChaptersState = useAllChaptersDownloadState(resolved.entry);
  const { entry, basePath } = resolved;

  const isThisPlaylistActive = player.playlist?.title === entry.occasionLabel;
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);
  const totalDuration = formatDuration(totalDurationSeconds(entry.audio));
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
      <ScreenHeader to={basePath} title={entry.occasionLabel} />
      <div className="playlist-header" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="playlist-header-main">
          <PlaylistPlayButton entry={entry} progressMap={progressMap} variant="large" />
          <div className="playlist-header-copy">
            <p className="playlist-header-title">{entry.occasionLabel}</p>
            <p className="playlist-header-subtitle">{totalDuration}</p>
          </div>
        </div>
        {headerDownload && <div className="playlist-header-side">{headerDownload}</div>}
      </div>

      <ShareButton title={entry.occasionLabel} />

      <ul className="playlist">
        {entry.audio.map((chapter, index) => (
          <PlaylistRow
            key={chapter.workerFilename}
            entry={entry}
            index={index}
            isActive={isThisPlaylistActive && player.currentIndex === index}
            player={player}
            progress={progress}
          />
        ))}
      </ul>
    </div>
  );
}
