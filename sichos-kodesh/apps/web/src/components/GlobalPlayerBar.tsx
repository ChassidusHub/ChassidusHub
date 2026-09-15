import { useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useLanguage';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The single, always-mounted (at App root, above the router) player bar -
 * Spotify/YouTube-style: survives navigating between screens because it
 * reads from PlayerContext rather than owning a `<audio>` element itself
 * (that lives in PlayerContext, mounted once). Renders nothing until
 * something has actually been played this session.
 */
export function GlobalPlayerBar() {
  const { t } = useTranslation();
  const player = usePlayer();
  const [showChapters, setShowChapters] = useState(false);

  if (!player.playlist) return null;

  const { audio } = player.playlist;
  const current = audio[player.currentIndex]!;
  const hasPrev = player.currentIndex > 0;
  const hasNext = player.currentIndex < audio.length - 1;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const chapterLabel = current.chapterName ?? (audio.length > 1 ? t.track(player.currentIndex + 1) : null);

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    player.seekToFraction(Number(e.target.value) / 100);
  }

  function selectChapter(index: number) {
    player.playChapter(index);
    setShowChapters(false);
  }

  return (
    <div className="global-player">
      {showChapters && (
        <div className="global-player-chapters">
          <div className="global-player-chapters-title">{player.playlist.title}</div>
          {audio.map((chapter, index) => (
            <button
              key={chapter.workerFilename}
              className={index === player.currentIndex ? 'global-player-chapter global-player-chapter-active' : 'global-player-chapter'}
              onClick={() => selectChapter(index)}
            >
              <span>{chapter.chapterName ?? t.track(index + 1)}</span>
              <span className="global-player-chapter-duration">{formatTime(chapter.durationMs / 1000)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="global-player-controls">
        <div className="global-player-transport">
          {audio.length > 1 && (
            <button className="global-player-skip" onClick={player.prev} disabled={!hasPrev} aria-label={t.previousChapter}>
              <SkipBack size={18} fill="currentColor" />
            </button>
          )}
          <button className="global-player-toggle" onClick={player.togglePlay} aria-label={player.playing ? t.pause : t.play}>
            {player.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          {audio.length > 1 && (
            <button className="global-player-skip" onClick={player.next} disabled={!hasNext} aria-label={t.nextChapter}>
              <SkipForward size={18} fill="currentColor" />
            </button>
          )}
        </div>
        <div className="global-player-scrub">
          <button className="global-player-title" onClick={() => setShowChapters((v) => !v)}>
            <span className="global-player-title-main">{player.playlist.title}</span>
            {chapterLabel && (
              <span className="global-player-title-sub">
                {audio.length > 1 ? `${player.currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}
              </span>
            )}
          </button>
          {player.error ? (
            <p className="global-player-error">{player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError}</p>
          ) : (
            <>
              <input type="range" min={0} max={100} value={progressPercent} onChange={seek} className="global-player-range" aria-label={t.seek} />
              <div className="global-player-times">
                <span>{formatTime(player.currentTime)}</span>
                <span>{formatTime(player.duration)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
