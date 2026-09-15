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
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';
import { DownloadProgressRing } from '../components/DownloadProgressRing';

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
 * Its own component (not inlined in the `.map()` below) because it calls
 * `useChapterDownload`, a hook - one instance per row keeps that call at a
 * stable position per row's own component identity, rather than inside a
 * loop body where React's hook-order rule doesn't apply cleanly.
 */
function PlaylistRow({ entry, index, isActive, player, progress }: PlaylistRowProps) {
  const { t } = useTranslation();
  const chapter = entry.audio[index]!;
  const download = useChapterDownload(entry, index);
  const finished = !isActive && isChapterFinished(progress, index, chapter);
  // The active row's own fraction comes straight from the player's live
  // currentTime/duration, not the localStorage snapshot (which only
  // advances on PlayerProvider's own throttled ~3s writes) - this is what
  // makes the row actually playing update its bar smoothly in real time
  // instead of sitting frozen (or, before, not rendering a bar for the
  // active row at all).
  const fraction = isActive
    ? player.duration > 0
      ? Math.min(player.currentTime / player.duration, 1)
      : 0
    : finished
      ? 0
      : chapterProgressFraction(progress, index, chapter);

  let downloadIcon = null;
  if (download.state === 'downloaded') {
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
          // from 0 - a real reported gap (tapping a part-listened chapter
          // restarted it from the beginning every time). Auto-advance
          // (PlayerProvider's own `next()` on `onEnded`) is untouched by
          // this and still correctly starts its chapter at 0 - that's a
          // fresh chapter someone hasn't manually chosen to resume, not
          // this code path.
          const savedPosition = progress?.chapters[index]?.position ?? 0;
          player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId }, index, savedPosition);
        }}
      >
        <span className="playlist-row-icon">
          {isActive && player.playing ? (
            <Pause size={16} fill="currentColor" />
          ) : finished ? (
            <CheckCircle2 size={16} className="finished-icon" aria-label={t.finishedLabel} />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </span>
        <span className="playlist-row-name">{chapter.chapterName ?? t.track(index + 1)}</span>
        {/* Always rendered, even at 0% (an invisible-fill track still reserves its own space) - conditionally
            rendering this element made every other row's layout shift depending on whether *this* row
            happened to have progress or not, a real reported alignment bug. */}
        <span className="playlist-row-progress-track" aria-hidden>
          <span className="playlist-row-progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
        <span className="playlist-row-duration">{formatTime(chapter.durationMs / 1000)}</span>
      </button>
      {/* One recording's own download affordance - independent of the whole
          occasion's download button/state (FarbrengenScreen), since someone
          on this page is choosing a specific sicha, not "everything here." */}
      <span className="row-icons">{downloadIcon}</span>
    </li>
  );
}

/**
 * A farbrengen is usually several separate recordings, not one (real
 * examples run to 8-10: a few sichos, a maamar, niggunim between them) -
 * this is the dedicated playlist page for one occasion's recordings
 * (reached from FarbrengenScreen's "Recordings" button), listing every
 * chapter with its real name and duration, Spotify-album-style, rather
 * than the old one-download-button-per-chapter layout crammed into the
 * occasion page itself.
 */
export function RecordingsScreen({ resolved }: Props) {
  const { t } = useTranslation();
  const player = usePlayer();
  const progressMap = useProgressMap();
  const { downloadAllChapters } = useDownload();
  const allChaptersState = useAllChaptersDownloadState(resolved.entry);
  const { entry, basePath } = resolved;

  const isThisPlaylistActive = player.playlist?.title === entry.occasionLabel;
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);

  return (
    <div className="screen">
      <BackLink to={basePath} />
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{t.recordings}</p>

      {allChaptersState !== 'unavailable' && (
        <p className="occasion-download-state">
          {allChaptersState === 'downloaded' && (
            <>
              <CheckCircle2 size={16} className="download-state-done" aria-hidden /> {t.downloadedLabel}
            </>
          )}
          {allChaptersState === 'downloading' && (
            <>
              <Loader2 size={16} className="download-state-spinner" aria-hidden /> {t.downloadingLabel}
            </>
          )}
          {allChaptersState === 'none' && (
            <button type="button" className="occasion-download-button" onClick={() => downloadAllChapters(entry)}>
              <Download size={16} aria-hidden /> {t.downloadAllRecordingsLabel}
            </button>
          )}
        </p>
      )}

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
