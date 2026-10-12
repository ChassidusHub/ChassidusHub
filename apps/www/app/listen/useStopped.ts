import { useEffect, useState } from 'react';
import { readStopped, type Stopped } from './stopped';

/**
 * Where this browser stopped (its cookie `name`), read in the browser once
 * the page is up: null while the page is drawn on the server and kept at the
 * edge for everyone (server/edge.ts), then the reader's own.
 */
export function useStopped(name: string): Stopped | null {
  const [stopped, setStopped] = useState<Stopped | null>(null);
  useEffect(() => setStopped(readStopped(document.cookie, name)), [name]);
  return stopped;
}
