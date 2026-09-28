import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react';
import { audioChapterName, chapterTitle } from '@sichos-kodesh/app-core';
import { formatPlaybackRate, nextPlaybackRate } from '@sichos-kodesh/catalog';
import { playlistTitle, SKIP_SECONDS } from '../player/playerContext';
import type { PlayerContextValue } from '../player/playerContext';
import { usePlayer } from '../player/usePlayer';
import { useTranslation } from '../i18n/useLanguage';
import { hebrewFullDateLabel } from '../utils/formatHebrewDate';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The mini player above the tabs; the full player open over the page; or put away, with only a pull-up handle left at the bottom edge. */
type BarMode = 'mini' | 'full' | 'hidden';

/** How far (px) a swipe has to travel to count. */
const SWIPE = 40;

/** Up or down from a swipe that went far enough, else null. */
function useSwipe(onSwipe: (direction: 'up' | 'down') => void) {
  const startY = useRef<number | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      startY.current = e.changedTouches[0]?.clientY ?? null;
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = startY.current;
      const end = e.changedTouches[0]?.clientY ?? null;
      startY.current = null;
      if (start == null || end == null) return;
      if (end - start > SWIPE) onSwipe('down');
      else if (start - end > SWIPE) onSwipe('up');
    },
  };
}

/** The play/pause button, spinning while the audio is still coming. */
function PlayToggle({ player, size, className }: { player: PlayerContextValue; size: number; className: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={className} onClick={player.togglePlay} aria-label={player.loading ? t.loading : player.playing ? t.pause : t.play}>
      {/* A play triangle's visual weight sits left of its geometric centre;
          a nudge of a couple of px reads as centred. `strokeWidth={0}` keeps
          lucide's outline from thickening the filled shapes. Tapping while
          it spins still toggles: it is not a disabled button. */}
      {player.loading ? (
        <Loader2 size={size} className="player-loading-spinner" />
      ) : player.playing ? (
        <Pause size={size} fill="currentColor" strokeWidth={0} />
      ) : (
        <Play size={size} fill="currentColor" strokeWidth={0} style={{ marginInlineStart: 2 }} />
      )}
    </button>
  );
}

/** 15 seconds back or forward: the circular arrow with the number inside it. */
function SkipSecondsButton({ direction, onClick, label }: { direction: 'back' | 'forward'; onClick: () => void; label: string }) {
  const Icon: typeof RotateCcw = direction === 'back' ? RotateCcw : RotateCw;
  return (
    <button type="button" className="full-player-seconds" onClick={onClick} aria-label={label} title={label}>
      <Icon size={30} strokeWidth={1.75} aria-hidden />
      <span className="full-player-seconds-number" aria-hidden>
        {SKIP_SECONDS}
      </span>
    </button>
  );
}

/** One line under the title: the occasion's date, then which chapter of how many. */
function subtitleOf(dateLabel: string, chapterLabel: string | null, index: number, count: number): ReactNode {
  if (!chapterLabel) return dateLabel;
  return `${dateLabel} · ${count > 1 ? `${index + 1}/${count} · ${chapterLabel}` : chapterLabel}`;
}

/**
 * The player (docs: the UI/UX redo plan, "The player"), mounted once at the
 * app root (App.tsx), so it survives moving between pages: it reads
 * PlayerContext rather than owning the `<audio>` element. Nothing shows
 * until something has been played this session.
 *
 * The mini player sits above the tabs, never over the page: the title,
 * the chapter, a thin progress line and play/pause. Tapping it (or
 * swiping it up) opens the full player - the occasion and its chapter
 * list, the position, 15 seconds back and forward, the chapters before
 * and after, and a speed control only for a shiur or a chazara. Swiping
 * the full player down closes it again; swiping the mini player down puts
 * it away and pauses, leaving a small handle at the bottom edge - swipe
 * up on that (or tap it) and the mini player is back, paused where it
 * was. Starting something new to play brings it back on its own.
 */
export function GlobalPlayerBar() {
  const { t, language } = useTranslation();
  const player = usePlayer();
  const [mode, setMode] = useState<BarMode>('mini');
  // True from the put-away gesture until its pause has landed - `player.playing` still reads true for a frame after `pause()`.
  const [awaitingPause, setAwaitingPause] = useState(false);

  // A put-away player comes back when something starts playing again -
  // the gesture paused the playback of the moment, not every later one.
  // Derived during render, so the bar never paints a frame in the old state.
  if (mode === 'hidden') {
    if (awaitingPause && !player.playing) setAwaitingPause(false);
    else if (!awaitingPause && player.playing) setMode('mini');
  }
  // Non-null exactly while a finger or pointer is down on the scrubber:
  // its value comes from here, not the ticking `currentTime`, so a
  // position update landing mid-drag (a still-buffering stream lags
  // behind a seek) never yanks the thumb back while it is being dragged.
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (dragPercent == null) return;
    const commit = () => setDragPercent(null);
    // Released anywhere, not only over the slider, the drag ends.
    window.addEventListener('pointerup', commit);
    window.addEventListener('pointercancel', commit);
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [dragPercent]);

  // The page below keeps room for the bar (`.app-content.has-player`).
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const measure = () => document.documentElement.style.setProperty('--player-bar-height', `${el.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--player-bar-height', '64px');
    };
  }, [mode, player.playlist, player.error]);

  // The full player: focus on its close button, Escape closes it, and the page behind stays still.
  useEffect(() => {
    if (mode !== 'full') return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('mini');
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.classList.add('full-player-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('full-player-open');
    };
  }, [mode]);

  const miniSwipe = useSwipe((direction) => {
    if (direction === 'up') setMode(mode === 'hidden' ? 'mini' : 'full');
    else if (mode === 'mini') {
      setMode('hidden');
      setAwaitingPause(player.playing);
      player.pause();
    }
  });
  const fullSwipe = useSwipe((direction) => {
    if (direction === 'down') setMode('mini');
  });

  if (!player.playlist) return null;

  if (mode === 'hidden') {
    return (
      <div ref={barRef} className="global-player global-player-hidden" {...miniSwipe}>
        <button type="button" className="global-player-handle" onClick={() => setMode('mini')} aria-label={t.showPlayer}>
          <span className="global-player-handle-pill" aria-hidden />
        </button>
      </div>
    );
  }

  const { audio } = player.playlist;
  const index = player.currentIndex;
  const current = audio[index]!;
  const progressPercent = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const displayedPercent = dragPercent ?? progressPercent;
  const chapterLabel = audioChapterName(current, language) ?? (audio.length > 1 ? t.track(index + 1) : null);
  const title = playlistTitle(player.playlist, language);
  // The occasion's name recurs every year; its date says which year's is playing.
  const dateLabel = hebrewFullDateLabel(player.playlist.hebrewDate, player.playlist.hebrewYear, language);
  const errorText = player.error ? (player.error.offline ? t.audioOfflineNotDownloaded : t.audioLoadError) : null;

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = Number(e.target.value);
    if (dragPercent != null) setDragPercent(percent);
    player.seekToFraction(percent / 100);
  };

  return (
    <>
      <div ref={barRef} className="global-player mini-player" {...miniSwipe}>
        <span className="mini-player-progress" aria-hidden>
          <span className="mini-player-progress-fill" style={{ width: `${displayedPercent}%` }} />
        </span>
        <div className="mini-player-row">
          <button type="button" className="mini-player-open" onClick={() => setMode('full')} aria-label={`${t.openPlayer}: ${title}`} aria-expanded={mode === 'full'}>
            <span className="global-player-title-main">{title}</span>
            <span className={errorText ? 'global-player-title-sub global-player-error' : 'global-player-title-sub'}>{errorText ?? subtitleOf(dateLabel, chapterLabel, index, audio.length)}</span>
          </button>
          <PlayToggle player={player} size={20} className="global-player-toggle" />
        </div>
      </div>

      {/* On the document's body, so nothing on the page (its header) can stand over it. */}
      {mode === 'full' &&
        createPortal(
        <div className="full-player-scrim" onClick={() => setMode('mini')}>
          <div className="full-player" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="full-player-top" {...fullSwipe}>
              <span className="full-player-grip" aria-hidden />
              <button ref={closeRef} type="button" className="icon-button full-player-close" onClick={() => setMode('mini')} aria-label={t.closePlayer} title={t.closePlayer}>
                <ChevronDown size={24} aria-hidden />
              </button>
            </div>

            <div className="full-player-now">
              <h2 className="full-player-title">{title}</h2>
              <p className="full-player-date">{dateLabel}</p>
              {chapterLabel && <p className="full-player-chapter">{audio.length > 1 ? `${index + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}</p>}
            </div>

            {errorText ? (
              <p className="global-player-error full-player-error">{errorText}</p>
            ) : (
              <div className="full-player-scrub">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.1}
                  value={displayedPercent}
                  onChange={seek}
                  onPointerDown={() => setDragPercent(progressPercent)}
                  className="global-player-range"
                  style={{ ['--global-player-progress' as string]: `${displayedPercent}%` }}
                  aria-label={t.seek}
                  aria-valuetext={`${formatTime(player.currentTime)} / ${formatTime(player.duration)}`}
                />
                <div className="global-player-times">
                  <span>{formatTime(player.currentTime)}</span>
                  <span>{formatTime(player.duration)}</span>
                </div>
              </div>
            )}

            <div className="full-player-transport">
              <button type="button" className="global-player-skip" onClick={player.prev} disabled={index === 0} aria-label={t.previousChapter} title={t.previousChapter}>
                <SkipBack size={22} fill="currentColor" strokeWidth={0} />
              </button>
              <SkipSecondsButton direction="back" onClick={() => player.seekBy(-SKIP_SECONDS)} label={t.skipBack(SKIP_SECONDS)} />
              <PlayToggle player={player} size={28} className="global-player-toggle full-player-toggle" />
              <SkipSecondsButton direction="forward" onClick={() => player.seekBy(SKIP_SECONDS)} label={t.skipForward(SKIP_SECONDS)} />
              <button type="button" className="global-player-skip" onClick={player.next} disabled={index >= audio.length - 1} aria-label={t.nextChapter} title={t.nextChapter}>
                <SkipForward size={22} fill="currentColor" strokeWidth={0} />
              </button>
            </div>

            {/* Only for a shiur or a chazara - the Rebbe's own recordings have no speed control (packages/catalog's playbackPolicy). One tap moves to the next speed. */}
            {player.playbackRateAllowed && (
              <div className="full-player-extras">
                <button type="button" className="global-player-rate" onClick={() => player.setPlaybackRate(nextPlaybackRate(player.playbackRate))} aria-label={t.playbackSpeed} title={t.playbackSpeed}>
                  {formatPlaybackRate(player.playbackRate)}
                </button>
              </div>
            )}

            {audio.length > 1 && (
              <section className="full-player-chapters" aria-label={t.playerChapters}>
                <h3 className="full-player-chapters-title">{t.playerChapters}</h3>
                <ol className="full-player-chapter-list">
                  {audio.map((chapter, i) => (
                    <li key={chapter.workerFilename}>
                      <button type="button" className={i === index ? 'global-player-chapter global-player-chapter-active' : 'global-player-chapter'} onClick={() => player.playChapter(i)} aria-current={i === index ? 'true' : undefined}>
                        <span>{chapterTitle(chapter, i, language, t.track)}</span>
                        <span className="global-player-chapter-duration">{formatTime(chapter.durationMs / 1000)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
