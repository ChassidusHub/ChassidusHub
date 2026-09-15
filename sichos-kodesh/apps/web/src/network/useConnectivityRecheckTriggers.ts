import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recheckIfOffline } from './connectivity';

/**
 * Mounted once at the app root (see App.tsx) - actively re-verifies
 * connectivity at the moments someone currently marked offline is most
 * likely to want a real answer: navigating to a different screen, tapping
 * anything at all, or returning to the app after it was backgrounded.
 * `recheckIfOffline` is a no-op while currently believed online, so every
 * listener here costs nothing the rest of the time - this is deliberately
 * not a timer (see connectivity.ts's own comment on why a background ping
 * was the wrong design).
 */
export function useConnectivityRecheckTriggers(): void {
  const location = useLocation();

  useEffect(() => {
    void recheckIfOffline();
  }, [location.key]);

  useEffect(() => {
    const handler = () => void recheckIfOffline();
    // Capture phase, on window, so this catches every tap anywhere in the
    // app without needing each individual button to know about it.
    window.addEventListener('click', handler, { capture: true });
    return () => window.removeEventListener('click', handler, { capture: true });
  }, []);

  useEffect(() => {
    // A real report: leaving the app and coming back could leave it stuck
    // showing offline until a manual refresh - a mobile browser can throttle
    // or suspend in-flight requests while backgrounded, so a fetch that
    // happened to fail right around that moment (see useAutoDownloadSync,
    // which fires once on mount and could race a not-yet-reconnected radio)
    // set the offline flag with no further trigger due until the next tap
    // or navigation, which the user may not think to make when the screen
    // already looks fully offline. Reappearing in the foreground is itself
    // a real, discrete event worth re-verifying against, same as a tap.
    const handler = () => {
      if (document.visibilityState === 'visible') void recheckIfOffline();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}
