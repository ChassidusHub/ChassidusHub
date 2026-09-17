import { useEffect, useState } from 'react';
import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useLanguage';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';

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
  const { t, language } = useTranslation();
  const player = usePlayer();
  const [showChapters, setShowChapters] = useState(false);
  // Non-null exactly while the user has a finger/pointer down on the
  // scrubber - the range input's displayed value comes from here instead
  // of the live ticking `currentTime` for that whole stretch, so a
  // playback-position update landing mid-drag doesn't snap the thumb back
  // to wherever the audio actually is right now and fight the drag - a
  // real, confirmed device-dependent bug: seeking on a still-buffering
  // network stream can lag the position tick noticeably behind where the
  // user already dragged to, so a controlled value bound straight to that
  // tick visibly yanks the thumb backwards while a drag is still in
  // progress.
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  useEffect(() => {
    if (dragPercent == null) return;
    function commit() {
      setDragPercent(null);
    }
    // The pointer can be released after moving off the input itself (a
    // drag that ends below/above the slider, say) - a window-level
    // listener, not just one on the input, is what makes the drag reliably
    // end everywhere, on every device, rather than only when the release
    // happens to land back on the element.
    window.addEventListener('pointerup', commit);
    window.addEventListener('pointercancel', commit);
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [dragPercent]);

  if (!player.playlist) return null;

  const { audio } = player.playlist;
  const current = audio[player.currentIndex]!;
  const hasPrev = player.currentIndex > 0;
  const hasNext = player.currentIndex < audio.length - 1;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayedPercent = dragPercent ?? progressPercent;
  const chapterLabel = current.chapterName ?? (audio.length > 1 ? t.track(player.currentIndex + 1) : null);
  // The playlist's own occasion label recurs every year - without its
  // date alongside it, this bar (and the OS lock-screen description it
  // feeds, see PlayerProvider) can't say *which* year's occurrence is
  // actually playing, unlike an occasion's own page, which is already
  // scoped to one source year.
  const dateLabel = hebrewFullDateLabel(player.playlist.hebrewDate, player.playlist.hebrewYear, language);

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const percent = Number(e.target.value);
    if (dragPercent != null) setDragPercent(percent);
    player.seekToFraction(percent / 100);
  }

  function beginDrag() {
    setDragPercent(progressPercent);
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
              <SkipBack size={20} fill="currentColor" strokeWidth={0} />
            </button>
          )}
          <button className="global-player-toggle" onClick={player.togglePlay} aria-label={player.loading ? t.loading : player.playing ? t.pause : t.play}>
            {/* A play triangle's own visual weight sits left of its true
                geometric center (an inherent asymmetric-shape effect, not a
                CSS bug) - nudging it right by a couple of px is what actually
                reads as centered, matching every real player's own play
                button; pause's two bars are already symmetric and need no
                such nudge. `strokeWidth={0}` on both: lucide draws a 2px
                stroke outline even on a filled icon by default, which
                double-thickens an already-solid shape - most visible on
                Pause's two bars, each barely a fifth of the icon's own
                width to begin with. Dropping the stroke leaves a clean
                solid glyph at the actual requested weight. `loading` (a
                fresh chapter, a skip, still buffering) wins over both -
                neither the OS media session nor a bare play/pause icon can
                show "still loading," and tapping this while it spins still
                works: it's a real togglePlay call, not a disabled button. */}
            {player.loading ? (
              <Loader2 size={20} className="player-loading-spinner" />
            ) : player.playing ? (
              <Pause size={20} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={20} fill="currentColor" strokeWidth={0} style={{ marginInlineStart: 2 }} />
            )}
          </button>
          {audio.length > 1 && (
            <button className="global-player-skip" onClick={player.next} disabled={!hasNext} aria-label={t.nextChapter}>
              <SkipForward size={20} fill="currentColor" strokeWidth={0} />
            </button>
          )}
        </div>
        <div className="global-player-scrub">
          <button className="global-player-title" onClick={() => setShowChapters((v) => !v)}>
            <span className="global-player-title-main">{player.playlist.title}</span>
            <span className="global-player-title-sub">
              {dateLabel}
              {chapterLabel && ` · ${audio.length > 1 ? `${player.currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}`}
            </span>
          </button>
          {player.error ? (
            <p className="global-player-error">{player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError}</p>
          ) : (
            <>
              <input
                type="range"
                min={0}
                max={100}
                value={displayedPercent}
                onChange={seek}
                onPointerDown={beginDrag}
                className="global-player-range"
                style={{ ['--global-player-progress' as string]: `${displayedPercent}%` }}
                aria-label={t.seek}
              />
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
