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
 * When enabled, opening a farbrengen's own highlighted hanacha PDF (see
 * FarbrengenScreen) also starts playing that occasion's recording, even if
 * something else is already playing - a deliberate override, not a
 * conditional one: reading the hanacha and hearing it are meant to happen
 * together when this is on. Off by default since interrupting whatever's
 * already playing is a real behavior change, not a safe default.
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
