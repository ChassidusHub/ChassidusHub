import type { CatalogAudio } from './types.js';

/** The speeds the apps offer where a speed control is allowed at all - 1 always among them. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];
export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

/**
 * The Rebbe's own recordings are never sped up or slowed down - a
 * farbrengen is heard as it was said, and neither app shows a speed
 * control for it. A shiur or a chazara (someone else speaking about the
 * sicha) is ordinary spoken audio, where a faster or slower speed is the
 * listener's own business. Both players consult this one rule, so the
 * distinction can never drift between them.
 */
export function isPlaybackRateAllowed(audio: Pick<CatalogAudio, 'kind'> | null | undefined): boolean {
  return audio?.kind === 'shiur' || audio?.kind === 'chazara';
}

/** The rate the player actually applies for `audio` given the listener's preferred rate: the preference where a speed control is allowed, 1 everywhere else. */
export function effectivePlaybackRate(audio: Pick<CatalogAudio, 'kind'> | null | undefined, preferred: number): PlaybackRate {
  if (!isPlaybackRateAllowed(audio)) return DEFAULT_PLAYBACK_RATE;
  return isPlaybackRate(preferred) ? preferred : DEFAULT_PLAYBACK_RATE;
}

export function isPlaybackRate(value: number): value is PlaybackRate {
  return (PLAYBACK_RATES as readonly number[]).includes(value);
}

/** The next rate in the cycle a single tap on the control moves through (1 → 1.25 → … → 2 → 0.75 → 1). */
export function nextPlaybackRate(current: number): PlaybackRate {
  const index = (PLAYBACK_RATES as readonly number[]).indexOf(current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]!;
}

/** "1×", "1.5×" - the control's own label. */
export function formatPlaybackRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2).replace(/0$/, '')}×`;
}
