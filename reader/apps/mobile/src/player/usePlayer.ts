import { useContext } from 'react';
import { PlayerContext } from './playerContext';
import type { PlayerContextValue } from './playerContext';

/**
 * Hook for consuming the global player context.
 * Must be used within a <PlayerProvider>.
 */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return ctx;
}
