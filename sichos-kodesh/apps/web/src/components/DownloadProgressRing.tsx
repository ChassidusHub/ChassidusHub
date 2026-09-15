interface Props {
  /** 0-1. */
  progress: number;
  size?: number;
}

/**
 * The active-download indicator once real byte progress is known - visually
 * the same size/weight as the gray `Loader2` spinner it replaces (see
 * OccasionRowIcon/FarbrengenScreen/RecordingsScreen), but green and static:
 * the arc itself fills clockwise with real progress instead of spinning to
 * indicate indeterminate work. Falls back to the spinning gray `Loader2` at
 * its call sites whenever a target's `Content-Length` (and so a real
 * fraction) isn't known yet - this component never guesses a value.
 */
export function DownloadProgressRing({ progress, size = 14 }: Props) {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="download-progress-ring" aria-hidden>
      <circle cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" className="download-progress-ring-track" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        className="download-progress-ring-fill"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
