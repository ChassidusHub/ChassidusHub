import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYBACK_RATE, PLAYBACK_RATES, effectivePlaybackRate, formatPlaybackRate, isPlaybackRateAllowed, nextPlaybackRate } from '../src/playbackPolicy.js';
import type { CatalogAudio } from '../src/types.js';

const rebbe: CatalogAudio = { workerFilename: 'sicha.mp3', durationMs: 1000, chapterName: 'Sicha 1' };
const shiur: CatalogAudio = { workerFilename: 'shiur.mp3', durationMs: 1000, kind: 'shiur' };
const chazara: CatalogAudio = { workerFilename: 'chazara.mp3', durationMs: 1000, kind: 'chazara' };

describe('isPlaybackRateAllowed', () => {
  it("never allows a speed change on the Rebbe's own recording (no kind)", () => {
    expect(isPlaybackRateAllowed(rebbe)).toBe(false);
    expect(isPlaybackRateAllowed(null)).toBe(false);
    expect(isPlaybackRateAllowed(undefined)).toBe(false);
  });

  it('allows it on a shiur and on a chazara', () => {
    expect(isPlaybackRateAllowed(shiur)).toBe(true);
    expect(isPlaybackRateAllowed(chazara)).toBe(true);
  });
});

describe('effectivePlaybackRate', () => {
  it("forces 1x for the Rebbe's recording whatever the listener prefers", () => {
    expect(effectivePlaybackRate(rebbe, 2)).toBe(1);
    expect(effectivePlaybackRate(rebbe, 0.75)).toBe(1);
  });

  it('applies the preference for a shiur, falling back to 1x for a rate that is not offered', () => {
    expect(effectivePlaybackRate(shiur, 1.5)).toBe(1.5);
    expect(effectivePlaybackRate(chazara, 2)).toBe(2);
    expect(effectivePlaybackRate(shiur, 3)).toBe(DEFAULT_PLAYBACK_RATE);
  });
});

describe('nextPlaybackRate', () => {
  it('cycles through every offered rate and wraps around', () => {
    let rate = 1;
    const seen: number[] = [];
    for (let i = 0; i < PLAYBACK_RATES.length; i++) {
      rate = nextPlaybackRate(rate);
      seen.push(rate);
    }
    expect(seen).toEqual([1.25, 1.5, 1.75, 2, 0.75, 1]);
  });

  it('starts the cycle from 1x for a rate that is not offered', () => {
    expect(nextPlaybackRate(3)).toBe(0.75);
  });
});

describe('formatPlaybackRate', () => {
  it('labels whole and fractional rates the way a player button does', () => {
    expect(formatPlaybackRate(1)).toBe('1×');
    expect(formatPlaybackRate(1.5)).toBe('1.5×');
    expect(formatPlaybackRate(1.25)).toBe('1.25×');
    expect(formatPlaybackRate(2)).toBe('2×');
  });
});
