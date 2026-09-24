import { MEDIA_PROXY_BASE_URL } from '../config';
import { watchNetworkState } from './networkState';
import type { NetworkState } from './networkState';

type Listener = () => void;

let online = true;
const listeners = new Set<Listener>();

function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  for (const listener of listeners) listener();
}

/** Plain, non-React accessor - callable from anywhere, including code with no component tree at all. */
export function getOnlineSnapshot(): boolean {
  return online;
}

/** For `useOnlineStatus` (via `useSyncExternalStore`) - the one place a React re-render is actually needed. */
export function subscribeOnline(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * One of the two ways this app decides it's offline: a real fetch - a PDF,
 * a recording, a download - actually failed to reach services/media-proxy.
 * The other is the phone's own network state (followNetworkState). There is
 * no background timer pinging anything to guess at this ahead of time (see
 * apps/web's connectivity.ts for the reasoning).
 */
export function reportFetchFailure(): void {
  setOnline(false);
}

/** A real fetch against services/media-proxy just succeeded - clears a stale offline flag immediately. Only call this where a genuine network round-trip is certain to have happened, never for a file served from local storage. */
export function reportFetchSuccess(): void {
  setOnline(true);
}

/** A real reachability check against services/media-proxy itself - only a thrown fetch error (no route to the host, DNS failure, genuinely offline) means "still offline"; any HTTP status at all means the network is there. */
async function pingMediaProxy(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    // A cache-busting query string, since React Native's fetch has no `cache: 'no-store'` option.
    await fetch(`${MEDIA_PROXY_BASE_URL}/?ping=${Date.now()}`, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the phone itself says: with no network at all the app is offline at
 * once - nothing else would say so while a download waits for its network,
 * since a waiting download never fails. A network Android has seen reach
 * the internet is online. One it hasn't (a filter that blocks Android's
 * own check, a captive portal, a signal with no service) is asked the only
 * question that matters: can the media proxy be reached.
 */
async function applyNetworkState(next: NetworkState): Promise<void> {
  if (!next.connected) setOnline(false);
  else if (next.validated) setOnline(true);
  else setOnline(await pingMediaProxy());
}

/** Mounted once at the app root (useConnectivityRecheckTriggers): follows the phone's network state from start-up on. */
export function followNetworkState(): () => void {
  return watchNetworkState((next) => {
    applyNetworkState(next).catch(() => undefined);
  });
}

/** Actively re-verifies connectivity - a no-op while currently believed online, so this is cheap to call from every navigation, tap, or return to the foreground (see useConnectivityRecheckTriggers). */
export async function recheckIfOffline(): Promise<void> {
  if (online) return;
  setOnline(await pingMediaProxy());
}

/**
 * Whether `error` looks like a genuine network failure rather than some
 * other real error (a corrupted PDF, an unsupported audio format) that
 * merely happened while loading something over the network - only the
 * former should ever mark the whole app offline. Covers RN's own fetch
 * wording, react-native-blob-util's, ExoPlayer's source errors, and OkHttp's.
 */
export function looksLikeNetworkError(error: unknown): boolean {
  return /Network request failed|NetworkError|Failed to connect|Unable to resolve host|UnknownHostException|SocketTimeoutException|ConnectException|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|HttpDataSource|Source error/i.test(String(error));
}
