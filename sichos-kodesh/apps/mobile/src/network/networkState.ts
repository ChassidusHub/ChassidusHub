import { useSyncExternalStore } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

/** The phone's own network state (android NetworkModule.kt). */
export interface NetworkState {
  /** There is a network that carries internet traffic. */
  connected: boolean;
  /** Android has seen that network reach the internet. */
  validated: boolean;
  /** It is Wi-Fi or another unmetered network - what a Wi-Fi-only download waits for. */
  unmetered: boolean;
}

interface NetworkModule {
  getState(): Promise<NetworkState>;
  startWatching(): void;
}

const NETWORK_CHANGED_EVENT = 'SichosKodeshNetworkChanged';

/** Until Android answers (and in tests, with no native module), a connection is assumed, as before. */
const ASSUMED: NetworkState = { connected: true, validated: true, unmetered: true };

let state: NetworkState = ASSUMED;
const listeners = new Set<() => void>();

/** Whether `next` differs from the state held; if so it is held and the hooks hear it. */
function setState(next: NetworkState): boolean {
  if (next.connected === state.connected && next.validated === state.validated && next.unmetered === state.unmetered) return false;
  state = next;
  for (const listener of listeners) listener();
  return true;
}

function nativeModule(): NetworkModule | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.SichosKodeshNetwork as NetworkModule | undefined) ?? null;
}

export function getNetworkState(): NetworkState {
  return state;
}

export function subscribeNetworkState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reads Android's network state and follows it from then on; `onChange`
 * hears the first state and each one that differs from the last (Android
 * also calls back on every change of signal strength, which says nothing
 * new here). connectivity.ts decides from it whether the app is online.
 * Returns the unsubscribe. A no-op without the native module.
 */
export function watchNetworkState(onChange: (next: NetworkState) => void): () => void {
  const native = nativeModule();
  if (!native) return () => undefined;
  let first = true;
  const apply = (next: NetworkState) => {
    const changed = setState(next);
    if (changed || first) onChange(next);
    first = false;
  };
  const emitter = new NativeEventEmitter(NativeModules.SichosKodeshNetwork);
  const subscription = emitter.addListener(NETWORK_CHANGED_EVENT, (next) => apply(next as NetworkState));
  native.getState().then(apply).catch(() => undefined);
  native.startWatching();
  return () => subscription.remove();
}

/** The phone's network state, live. */
export function useNetworkState(): NetworkState {
  return useSyncExternalStore(subscribeNetworkState, getNetworkState);
}
