import { describe, expect, it } from 'vitest';
import { resolveOccasion } from '../src/gapHandling.js';
import type { GapResolutionContext } from '../src/types.js';

function ctx(overrides: Partial<GapResolutionContext> = {}): GapResolutionContext {
  return {
    sourceYear: 5750,
    gapStrategy: 'skip',
    candidateYears: [],
    hasRecording: () => false,
    ...overrides,
  };
}

describe('resolveOccasion', () => {
  it('resolves to the source year when it has a recording', () => {
    const result = resolveOccasion('week:3', ctx({ hasRecording: (year) => year === 5750 }));
    expect(result).toEqual({ status: 'primary', resolvedYear: 5750 });
  });

  it('reports a gap under "skip" when the source year lacks the recording', () => {
    const result = resolveOccasion('week:3', ctx({ gapStrategy: 'skip', hasRecording: () => false }));
    expect(result).toEqual({ status: 'gap', resolvedYear: null });
  });

  it('falls back to the nearest kvius-matched candidate year that has a recording', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({
        gapStrategy: 'nearestKviusYear',
        candidateYears: [5722, 5741, 5769],
        hasRecording: (year) => year === 5722,
      }),
    );
    expect(result).toEqual({ status: 'fallback', resolvedYear: 5722 });
  });

  it('picks the closest candidate to the source year, not the earliest in the list', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({
        sourceYear: 5750,
        gapStrategy: 'nearestKviusYear',
        candidateYears: [5722, 5741, 5769],
        hasRecording: (year) => year === 5722 || year === 5769,
      }),
    );
    // |5769-5750| = 19 < |5722-5750| = 28
    expect(result).toEqual({ status: 'fallback', resolvedYear: 5769 });
  });

  it('reports a gap under "nearestKviusYear" when no candidate has a recording either', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({ gapStrategy: 'nearestKviusYear', candidateYears: [5722, 5741], hasRecording: () => false }),
    );
    expect(result).toEqual({ status: 'gap', resolvedYear: null });
  });

  it('a manual override wins even when the source year has a recording', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({
        hasRecording: (year) => year === 5750 || year === 5701,
        manualOverrides: { 'week:3': 5701 },
      }),
    );
    expect(result).toEqual({ status: 'manual', resolvedYear: 5701 });
  });

  it('a manual override to a year without a recording is a gap, not a silent fallback to source', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({
        hasRecording: (year) => year === 5750,
        manualOverrides: { 'week:3': 5701 },
      }),
    );
    expect(result).toEqual({ status: 'gap', resolvedYear: null });
  });

  it('never proposes the source year itself as a fallback candidate', () => {
    const result = resolveOccasion(
      'week:3',
      ctx({
        sourceYear: 5750,
        gapStrategy: 'nearestKviusYear',
        candidateYears: [5750],
        hasRecording: (year) => year === 5750,
      }),
    );
    // hasRecording(sourceYear) is true, so this should resolve via 'primary', not 'fallback' -
    // this guards against double-counting the source year in the fallback search.
    expect(result.status).toBe('primary');
  });
});
