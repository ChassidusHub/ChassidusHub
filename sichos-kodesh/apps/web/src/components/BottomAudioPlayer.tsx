import { useRef, useState } from 'react';
import { audioUrl } from '../download/download';

interface Props {
  workerFilename: string;
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
 */
export function BottomAudioPlayer({ workerFilename }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bottom-player">
      <audio
        ref={audioRef}
        src={audioUrl(workerFilename)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <button className="bottom-player-toggle" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <div className="bottom-player-scrub">
        <input
          type="range"
          min={0}
          max={100}
          value={progressPercent}
          onChange={seek}
          className="bottom-player-range"
          aria-label="Seek"
        />
        <div className="bottom-player-times">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
