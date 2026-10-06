import { useContext } from 'react';
import { PlayerContext } from './playerContext';
import type { PlayerContextValue } from './playerContext';

/** Nothing is playing until something calls `play()` - guard the `usePlayer().playlist` null case at call sites, don't assume it's always populated. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
