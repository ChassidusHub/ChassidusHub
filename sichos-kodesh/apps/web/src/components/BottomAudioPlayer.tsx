import { useRef, useState } from 'react';
import type { CatalogAudio } from '@sichos-kodesh/catalog';
import { audioUrl } from '../download/download';

interface Props {
  audio: CatalogAudio[];
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A persistent, Spotify-style bottom bar so an occasion's recording can
 * keep playing while its PDF is scrolled/read - rendered by
 * PdfViewerScreen alongside the page canvases, not as a separate screen.
 *
 * A farbrengen is usually several separate recordings, not one (real
 * examples run to 8-10: a few sichos, a maamar, niggunim between them) -
 * `audio`'s array order is already the real chapter/playback order (see
 * packages/mafteiach-index's jemAudio.ts), so this plays through it like
 * a real chapters list: prev/next, an expandable chapter picker, and
 * auto-advance into the next chapter when one ends.
 */
export function BottomAudioPlayer({ audio }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showChapters, setShowChapters] = useState(false);

  const current = audio[currentIndex]!;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < audio.length - 1;

  function playChapter(index: number) {
    setCurrentIndex(index);
    setCurrentTime(0);
    setShowChapters(false);
    // Picking a chapter (from the list, or via prev/next) always starts it
    // playing, matching Spotify/YouTube - the freshly-mounted <audio> below
    // (keyed on the chapter, so its own playback state resets) picks this
    // up via `autoPlay`; the manual `.play()` is a same-gesture fallback for
    // browsers where the timing of that alone is unreliable.
    setPlaying(true);
    requestAnimationFrame(() => audioRef.current?.play());
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    if (!el || duration === 0) return;
    el.currentTime = (Number(e.target.value) / 100) * duration;
  }

  function handleEnded() {
    if (hasNext) playChapter(currentIndex + 1);
    else setPlaying(false);
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const chapterLabel = current.chapterName ?? (audio.length > 1 ? `Track ${currentIndex + 1}` : null);

  return (
    <div className="bottom-player">
      {showChapters && (
        <div className="bottom-player-chapters">
          {audio.map((chapter, index) => (
            <button
              key={chapter.workerFilename}
              className={index === currentIndex ? 'bottom-player-chapter bottom-player-chapter-active' : 'bottom-player-chapter'}
              onClick={() => playChapter(index)}
            >
              <span>{chapter.chapterName ?? `Track ${index + 1}`}</span>
              <span className="bottom-player-chapter-duration">{formatTime(chapter.durationMs / 1000)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="bottom-player-controls">
        <audio
          key={current.workerFilename}
          ref={audioRef}
          src={audioUrl(current.workerFilename)}
          autoPlay={playing}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={handleEnded}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />
        {audio.length > 1 && (
          <button className="bottom-player-skip" onClick={() => hasPrev && playChapter(currentIndex - 1)} disabled={!hasPrev} aria-label="Previous chapter">
            ⏮
          </button>
        )}
        <button className="bottom-player-toggle" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </button>
        {audio.length > 1 && (
          <button className="bottom-player-skip" onClick={() => hasNext && playChapter(currentIndex + 1)} disabled={!hasNext} aria-label="Next chapter">
            ⏭
          </button>
        )}
        <div className="bottom-player-scrub">
          {chapterLabel && (
            <button className="bottom-player-chapter-toggle" onClick={() => setShowChapters((v) => !v)}>
              {audio.length > 1 ? `${currentIndex + 1}/${audio.length} · ${chapterLabel}` : chapterLabel}
            </button>
          )}
          <input type="range" min={0} max={100} value={progressPercent} onChange={seek} className="bottom-player-range" aria-label="Seek" />
          <div className="bottom-player-times">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
