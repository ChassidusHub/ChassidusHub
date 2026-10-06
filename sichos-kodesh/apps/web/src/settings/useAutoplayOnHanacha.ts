import { useState } from 'react';

const STORAGE_KEY = 'sichos-kodesh:autoplay-on-hanacha';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Opening a farbrengen's own highlighted hanacha PDF (see FarbrengenScreen)
 * always starts playing that occasion's recording - reading the hanacha and
 * hearing it are meant to happen together. This setting only matters for
 * the one case where that's a real interruption: a *different* recording
 * is already actively playing. On, the hanacha's own recording takes over
 * as usual; off, whatever's already playing is left alone and the hanacha
 * doesn't start a new one. Off by default since silently cutting off
 * something the user is actively listening to is a real behavior change,
 * not a safe default.
 */
export function useAutoplayOnHanacha(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabledState] = useState<boolean>(readStored);

  function setEnabled(next: boolean): void {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Best-effort persistence only.
    }
  }

  return [enabled, setEnabled];
}
