import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recheckIfOffline } from './connectivity';

/**
 * Mounted once at the app root (see App.tsx) - actively re-verifies
 * connectivity at the two moments someone currently marked offline is most
 * likely to want a real answer: navigating to a different screen, or
 * tapping anything at all. `recheckIfOffline` is a no-op while currently
 * believed online, so both listeners here cost nothing the rest of the
 * time - this is deliberately not a timer (see connectivity.ts's own
 * comment on why a background ping was the wrong design).
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
}
