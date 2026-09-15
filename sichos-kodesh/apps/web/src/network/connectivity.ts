import { MEDIA_PROXY_BASE_URL } from '../config';

type Listener = () => void;

let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<Listener>();

function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  for (const listener of listeners) listener();
}

/** Plain, non-React accessor - callable from anywhere, including code with no component tree at all (downloadManager.ts). */
export function getOnlineSnapshot(): boolean {
  return online;
}

/** For `useOnlineStatus` (via `useSyncExternalStore`) - the one place a React re-render is actually needed. */
export function subscribeOnline(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The one and only way this app ever decides it's offline: a real fetch -
 * a PDF, a recording, a download - actually failed to reach
 * services/media-proxy. There is no background timer pinging anything to
 * guess at this ahead of time. A synthetic ping against an unrelated
 * endpoint (this app's own static hosting on Vercel, say) is a confirmed
 * unreliable signal in production: it stayed reachable regardless of
 * whether the one thing this app actually needs - the Worker - could be
 * reached at all, which is exactly backwards for a signal whose only job
 * is "can this app do anything useful right now."
 */
export function reportFetchFailure(): void {
  setOnline(false);
}

/**
 * A real fetch against services/media-proxy just succeeded - clears a
 * stale offline flag immediately. Only call this where a genuine network
 * round-trip is certain to have happened, not merely "this succeeded" -
 * a cached response (the service worker's own CacheFirst route, or a
 * `<audio>`/pdf.js load that resolved from Cache Storage) proves nothing
 * about real connectivity and would be a false "back online" while
 * genuinely offline.
 */
export function reportFetchSuccess(): void {
  setOnline(true);
}

/**
 * A real reachability check against services/media-proxy itself, not a
 * same-origin ping (see reportFetchFailure's comment on why that's the
 * wrong signal). `no-cors` mode deliberately: this only needs to know
 * whether the network round-trip itself succeeded, not read anything
 * about the response, so it can't be defeated by the Worker's CORS
 * headers happening not to cover whatever path is pinged - only a thrown
 * fetch error (no route to the host, DNS failure, genuinely offline)
 * means "still offline."
 */
async function pingMediaProxy(): Promise<boolean> {
  try {
    await fetch(MEDIA_PROXY_BASE_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Actively re-verifies connectivity - a no-op while currently believed
 * online, so this is cheap to call liberally. Meant to be called only
 * from a real moment worth checking (see useConnectivityRecheckTriggers:
 * a page navigation or a tap anywhere in the app while offline), never on
 * a timer - the previous background-polling design was the same
 * unreliable-signal problem described above, just on a schedule instead
 * of a fixed endpoint.
 */
export async function recheckIfOffline(): Promise<void> {
  if (online) return;
  setOnline(await pingMediaProxy());
}

/**
 * Whether `error` looks like a genuine network failure rather than some
 * other real error (a corrupted PDF, an unsupported audio format) that
 * merely happened while loading something over the network - only the
 * former should ever mark the whole app offline. Covers the actual
 * cross-browser wording for a failed fetch (Chrome: "Failed to fetch";
 * Firefox: "NetworkError when attempting to fetch resource"; Safari:
 * "Load failed"), plus pdf.js's own wrapped messages, which embed the
 * same "Failed to fetch" phrasing for a worker/asset load that couldn't
 * reach the network (the exact confirmed real report).
 */
export function looksLikeNetworkError(error: unknown): boolean {
  return /Failed to fetch|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED|ERR_NETWORK/i.test(String(error));
}
