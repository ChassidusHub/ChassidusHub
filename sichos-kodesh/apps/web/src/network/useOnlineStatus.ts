import { useEffect, useRef, useState } from 'react';

/**
 * A plain static file, not matched by either of vite.config.ts's
 * runtimeCaching rules (one's scoped to the external media-proxy origin,
 * the other to pdf.js's own worker/wasm/cmaps paths) and never precached
 * under a random-query URL, so a request to it genuinely reaches the
 * network - or genuinely fails - instead of resolving from Cache Storage
 * regardless of real connectivity.
 */
const PROBE_PATH = '/favicon.svg';

async function probeRealConnectivity(): Promise<boolean> {
  try {
    await fetch(`${PROBE_PATH}?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Live connectivity status - used by the home screen's offline note, the
 * top-of-page connectivity banner, and DownloadedScreen's own reach point
 * from that note.
 *
 * `navigator.onLine`/the `online`/`offline` window events alone are a
 * known weak spot on mobile browsers: they only fire on a state *change*
 * the browser happens to observe, not on demand, so a brief network blip -
 * or the tab simply being backgrounded at the moment connectivity actually
 * returns - can leave `offline` stuck reporting true indefinitely with no
 * further `online` event ever following to correct it (a confirmed real
 * report: the banner stayed stuck "offline" with a fully working
 * connection). Rather than trust that stale state forever, this actively
 * re-verifies with a real network request whenever it currently believes
 * it's offline - immediately, again whenever the tab regains focus/
 * visibility (exactly when a change while backgrounded would otherwise go
 * unnoticed), and periodically in between - and self-corrects the moment
 * one succeeds.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const probeInFlightRef = useRef(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (online) return;
    let cancelled = false;

    const check = () => {
      if (probeInFlightRef.current) return;
      probeInFlightRef.current = true;
      void probeRealConnectivity().then((reallyOnline) => {
        probeInFlightRef.current = false;
        if (!cancelled && reallyOnline) setOnline(true);
      });
    };

    check();
    const interval = setInterval(check, 15000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [online]);

  return online;
}
