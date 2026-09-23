import { useEffect } from 'react';
import { AppState } from 'react-native';
import { recheckIfOffline } from './connectivity';

function recheck(): void {
  recheckIfOffline().catch(() => undefined);
}

/**
 * Mounted once at the app root - actively re-verifies connectivity at the
 * moments someone currently marked offline is most likely to want a real
 * answer: returning to the app after it was backgrounded, and (via
 * `onNavigationStateChange`, wired in App.tsx) navigating to a different
 * screen. `recheckIfOffline` is a no-op while currently believed online, so
 * every trigger here costs nothing the rest of the time.
 */
export function useConnectivityRecheckTriggers(): void {
  useEffect(() => {
    recheck();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck();
    });
    return () => subscription.remove();
  }, []);
}

/** For NavigationContainer's `onStateChange` - a screen change is a real, discrete moment worth re-checking at. */
export function onNavigationStateChange(): void {
  recheck();
}
