import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '../ui/theme';

interface Props {
  /** 0-1. */
  progress: number;
  size?: number;
}

/** The active-download indicator once real byte progress is known - same size/weight as the grey spinner it replaces, but green and static: the arc fills clockwise with real progress. */
export function DownloadProgressRing({ progress, size = 14 }: Props) {
  const colors = useColors();
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(progress, 0), 1));
  const center = size / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" stroke={colors.muted} opacity={0.3} />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke={colors.accent}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </Svg>
  );
}
