import { useEffect, useRef, useState } from 'react';

/**
 * A plain static file, not matched by either of vite.config.ts's
 * runtimeCaching rules (one's scoped to the external media-proxy origin,
 * the other to pdf.js's own worker/wasm/cmaps paths) and never precached
 * under a random-query URL, so a request to it genuinely reaches the
 * network - or genuinely fails - instead of resolving from Cache Storage
 * regardless of real connectivity. Kept same-origin rather than pinging a
 * third-party host (the common pattern - e.g. Android/ChromeOS's own
 * captive-portal check against a Google endpoint): this audience commonly
 * runs content-filtering software (a real report: Rimon) that can block a
 * generic third-party target specifically while the app's own domain and
 * the media-proxy Worker it depends on both stay perfectly reachable - a
 * same-origin probe can't produce that false negative.
 */
const PROBE_PATH = '/favicon.svg';
const PROBE_INTERVAL_MS = 10000;
const PROBE_TIMEOUT_MS = 5000;

/**
 * Exported for the few call sites that need a fresh, real answer at one
 * specific instant - a PDF or recording failing to load, say - rather than
 * this hook's own live, continuously-updated value: `useOnlineStatus`'s
 * state can be up to `PROBE_INTERVAL_MS` stale, which is fine for a banner
 * but not for deciding, right now, whether *this* failure was caused by
 * being offline.
 */
export async function probeRealConnectivity(): Promise<boolean> {
  try {
    await fetch(`${PROBE_PATH}?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
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
 * Driven by an actual, continuous network probe rather than trusting
 * `navigator.onLine`/the `online`/`offline` window events as the source of
 * truth: those only fire on a state *change* the browser happens to
 * observe, not on demand, and mobile browsers are known to miss the
 * transition in either direction - a confirmed real report of the banner
 * staying stuck "offline" on a working connection (no `online` event ever
 * arrived to correct it), and, chasing that fix, an equally real second
 * bug it exposed: gating the probe to only run while already-believed-
 * offline meant a genuine drop that never fired a matching `offline`
 * event in the first place (also a known mobile-browser gap - a weak-
 * signal fade doesn't always cleanly flip the interface state) left the
 * banner never showing at all.
 *
 * The probe itself is what decides `online` here, on a fixed interval
 * (matching how, say, Android/ChromeOS determine real connectivity - a
 * periodic live check against a server, not just the OS's own reported
 * link state) - the browser events are only used to trigger an immediate
 * extra check on top of that interval, for a faster-feeling update right
 * when the browser itself notices something change, never trusted for
 * their claimed direction on their own.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const probeInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (probeInFlightRef.current) return;
      probeInFlightRef.current = true;
      void probeRealConnectivity().then((reallyOnline) => {
        probeInFlightRef.current = false;
        if (!cancelled) setOnline(reallyOnline);
      });
    };

    check();
    const interval = setInterval(check, PROBE_INTERVAL_MS);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  return online;
}
