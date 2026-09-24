import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { audioChapterName, chapterTitle } from '@sichos-kodesh/app-core';
import { formatPlaybackRate, nextPlaybackRate } from '@sichos-kodesh/catalog';
import { playlistTitle } from '../player/playerContext';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useLanguage';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Full controls; a one-line summary; or put away entirely, with only a pull-up handle left at the bottom edge. */
type BarMode = 'full' | 'collapsed' | 'hidden';

/**
 * The single, always-mounted (at App root, above the router) player bar -
 * Spotify/YouTube-style: survives navigating between screens because it
 * reads from PlayerContext rather than owning a `<audio>` element itself
 * (that lives in PlayerContext, mounted once). Renders nothing until
 * something has actually been played this session.
 *
 * Swiping down on it collapses it to a one-line summary; a second swipe
 * down puts it away and pauses playback, leaving a small handle at the
 * bottom edge - swipe up on that (or tap it) and the bar is back, paused
 * where it was. Starting something new to play brings it back on its own.
 */
export function GlobalPlayerBar() {
  const { t, language } = useTranslation();
  const player = usePlayer();
  const [showChapters, setShowChapters] = useState(false);
  const [mode, setMode] = useState<BarMode>('full');
  // True from the hide gesture until its pause has actually landed -
  // `player.playing` still reads true for a frame after `pause()`.
  const [awaitingPause, setAwaitingPause] = useState(false);
  const collapsed = mode === 'collapsed';

  // A hidden bar comes back when something starts playing again - the
  // gesture put the *previous* playback away (paused it), not every
  // future one. Derived during render rather than in an effect, so the
  // bar never paints a frame in the stale state.
  if (mode === 'hidden') {
    if (awaitingPause && !player.playing) setAwaitingPause(false);
    else if (!awaitingPause && player.playing) setMode('full');
  }
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
  const playerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

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

  useLayoutEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    document.documentElement.style.setProperty('--player-bar-height', `${el.offsetHeight}px`);
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--player-bar-height', `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--player-bar-height', '96px');
    };
  }, [mode, showChapters, player.playlist, player.error]);

  if (!player.playlist) return null;

  if (mode === 'hidden') {
    return (
      <div ref={playerRef} className="global-player global-player-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button type="button" className="global-player-handle" onClick={() => setMode('full')} aria-label={t.showPlayer}>
          <span className="global-player-handle-pill" aria-hidden />
        </button>
      </div>
    );
  }

  const { audio } = player.playlist;
  const current = audio[player.currentIndex]!;
  const hasPrev = player.currentIndex > 0;
  const hasNext = player.currentIndex < audio.length - 1;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayedPercent = dragPercent ?? progressPercent;
  const chapterLabel = audioChapterName(current, language) ?? (audio.length > 1 ? t.track(player.currentIndex + 1) : null);
  const title = playlistTitle(player.playlist, language);
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

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartY.current = e.changedTouches[0]?.clientY ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startY = touchStartY.current;
    const endY = e.changedTouches[0]?.clientY ?? null;
    touchStartY.current = null;
    if (startY == null || endY == null) return;
    const deltaY = endY - startY;
    if (deltaY > 40) {
      if (mode === 'full') {
        setMode('collapsed');
        setShowChapters(false);
      } else if (mode === 'collapsed') {
        setMode('hidden');
        setAwaitingPause(player.playing);
        player.pause();
      }
    } else if (deltaY < -40 && mode !== 'full') {
      setMode('full');
    }
  }

  function expandPlayer() {
    setMode('full');
  }

  return (
    <div
      ref={playerRef}
      className={collapsed ? 'global-player global-player-collapsed' : 'global-player'}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {showChapters && (
        <div className="global-player-chapters">
          <div className="global-player-chapters-title">{title}</div>
          {audio.map((chapter, index) => (
            <button
              key={chapter.workerFilename}
              className={index === player.currentIndex ? 'global-player-chapter global-player-chapter-active' : 'global-player-chapter'}
              onClick={() => selectChapter(index)}
            >
              <span>{chapterTitle(chapter, index, language, t.track)}</span>
              <span className="global-player-chapter-duration">{formatTime(chapter.durationMs / 1000)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="global-player-controls">
        {collapsed ? (
          <button type="button" className="global-player-collapsed-summary" onClick={expandPlayer}>
            <span className="global-player-title-main">{title}</span>
            <span className="global-player-title-sub">
              {dateLabel}
              {chapterLabel && ` · ${audio.length > 1 ? `${player.currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}`}
            </span>
            {player.error ? (
              <span className="global-player-error">{player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError}</span>
            ) : (
              <span className="global-player-collapsed-progress" aria-hidden>
                <span className="global-player-collapsed-progress-fill" style={{ width: `${displayedPercent}%` }} />
              </span>
            )}
          </button>
        ) : (
          <>
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
          {/* Only for a shiur or a chazara - the Rebbe's own recordings have no speed control at all (see playbackPolicy in packages/catalog). One tap moves to the next speed. */}
          {player.playbackRateAllowed && (
            <button type="button" className="global-player-rate" onClick={() => player.setPlaybackRate(nextPlaybackRate(player.playbackRate))} aria-label={t.playbackSpeed} title={t.playbackSpeed}>
              {formatPlaybackRate(player.playbackRate)}
            </button>
          )}
        </div>
        <div className="global-player-scrub">
          <button className="global-player-title" onClick={() => setShowChapters((v) => !v)}>
            <span className="global-player-title-main">{title}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
