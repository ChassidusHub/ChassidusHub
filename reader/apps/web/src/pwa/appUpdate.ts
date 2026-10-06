import { registerSW } from 'virtual:pwa-register';

type Listener = () => void;

let needsRefresh = false;
let checking = false;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * `registerType: 'prompt'` (vite.config.ts) - a newly-found service worker
 * installs and waits rather than silently taking over and reloading the
 * page on its own, so `needsRefresh`/`applyUpdate` below actually control
 * something real. Registered here, at module scope, rather than in
 * main.tsx directly, so the rest of the app (the About screen's "Update
 * app" section) has something to import and call into - main.tsx just
 * imports this file once for its side effect, same as `polyfills.ts`.
 */
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needsRefresh = true;
    notify();
  },
  onRegisteredSW(_url, reg) {
    registration = reg ?? null;
  },
});

export function getNeedsRefresh(): boolean {
  return needsRefresh;
}

export function getChecking(): boolean {
  return checking;
}

export function subscribeAppUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Actively asks the browser to re-fetch the service worker script right
 * now, rather than waiting for whatever periodic check it does on its own
 * (typically only around navigation) - the same thing a "check for
 * updates" action does in a native app. A no-op if the service worker
 * hasn't finished registering yet (nothing to ask).
 */
export async function checkForUpdate(): Promise<void> {
  if (!registration || checking) return;
  checking = true;
  notify();
  try {
    await registration.update();
  } finally {
    checking = false;
    notify();
  }
}

/**
 * Activates the already-installed new service worker and reloads - the
 * other half of `registerType: 'prompt'`: a worker finishing installation
 * (`onNeedRefresh` above) only means one is *ready*, not that this tab is
 * running its code yet, since a tab that's already loaded its JS/CSS keeps
 * running the old bundle until it actually reloads.
 */
export function applyUpdate(): void {
  void updateSW(true);
}
