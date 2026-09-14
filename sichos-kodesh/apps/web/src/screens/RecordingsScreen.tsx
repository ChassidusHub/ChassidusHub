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
      <BackLink to={basePath}>{t.back}</BackLink>
      <h1>{entry.occasionLabel}</h1>
      <p className="subtitle">{t.recordings}</p>

      <ul className="playlist">
        {entry.audio.map((chapter, index) => {
          const isActive = isThisPlaylistActive && player.currentIndex === index;
          const finished = !isActive && isChapterFinished(progress, index, chapter);
          const fraction = !isActive && !finished ? chapterProgressFraction(progress, index, chapter) : 0;
          return (
            <li key={chapter.workerFilename}>
              <button
                className={isActive ? 'playlist-row playlist-row-active' : 'playlist-row'}
                onClick={() => player.play({ title: entry.occasionLabel, audio: entry.audio, hebrewYear: entry.hebrewYear, occasionId: entry.occasionId }, index)}
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
                {fraction > 0 && (
                  <span className="playlist-row-progress-track" aria-hidden>
                    <span className="playlist-row-progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
                  </span>
                )}
                <span className="playlist-row-duration">{formatTime(chapter.durationMs / 1000)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
