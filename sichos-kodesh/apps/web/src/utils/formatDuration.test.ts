import { describe, expect, it } from 'vitest';
import { formatDuration, totalDurationSeconds } from './formatDuration';

describe('formatDuration', () => {
  it('formats short durations as m:ss', () => {
    expect(formatDuration(307)).toBe('5:07');
  });

  it('formats hour-long durations as h:mm:ss', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('returns 0:00 for invalid input', () => {
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(-1)).toBe('0:00');
  });
});

describe('totalDurationSeconds', () => {
  it('sums all chapter durations', () => {
    expect(totalDurationSeconds([{ durationMs: 61000 }, { durationMs: 59000 }, { durationMs: 3600000 }])).toBe(3720);
  });
});
