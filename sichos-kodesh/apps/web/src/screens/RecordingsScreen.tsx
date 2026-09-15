import { CheckCircle2, Pause, Play } from 'lucide-react';
import type { ResolvedEntry } from '../routes/useResolvedEntry';
import { usePlayer } from '../player/usePlayer';
import { chapterProgressFraction, getOccasionProgress, isChapterFinished } from '../player/progressStore';
import { useProgressMap } from '../player/useProgressMap';
import { useTranslation } from '../i18n/useLanguage';
import { BackLink } from '../components/BackLink';

interface Props {
  resolved: ResolvedEntry;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
  const { entry, basePath } = resolved;

  const isThisPlaylistActive = player.playlist?.title === entry.occasionLabel;
  const progress = getOccasionProgress(progressMap, entry.hebrewYear, entry.occasionId);

  return (
    <div className="screen">
      <BackLink to={basePath} />
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{t.recordings}</p>

      <ul className="playlist">
        {entry.audio.map((chapter, index) => {
          const isActive = isThisPlaylistActive && player.currentIndex === index;
          const finished = !isActive && isChapterFinished(progress, index, chapter);
          // The active row's own fraction comes straight from the player's
          // live currentTime/duration, not the localStorage snapshot (which
          // only advances on PlayerProvider's own throttled ~3s writes) -
          // this is what makes the row actually playing update its bar
          // smoothly in real time instead of sitting frozen (or, before,
          // not rendering a bar for the active row at all).
          const fraction = isActive
            ? player.duration > 0
              ? Math.min(player.currentTime / player.duration, 1)
              : 0
            : finished
              ? 0
              : chapterProgressFraction(progress, index, chapter);
          return (
            <li key={chapter.workerFilename}>
              <button
                className={isActive ? 'playlist-row playlist-row-active' : 'playlist-row'}
                onClick={() => {
                  // Resumes from wherever this chapter was left off, not
                  // always from 0 - a real reported gap (tapping a
                  // part-listened chapter restarted it from the beginning
                  // every time). Auto-advance (PlayerProvider's own `next()`
                  // on `onEnded`) is untouched by this and still correctly
                  // starts its chapter at 0 - that's a fresh chapter someone
                  // hasn't manually chosen to resume, not this code path.
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
