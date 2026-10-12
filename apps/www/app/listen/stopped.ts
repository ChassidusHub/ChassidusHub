/* Where a reader stopped: shared by the server (reading the cookie) and the browser (writing it). No imports, so a plain test reads it. */

/**
 * Where a reader stopped, kept in a cookie. Home's and Listen's "continue"
 * is drawn from it in the browser (useStopped.ts), its place held open from
 * the first paint (root.tsx, RESUME_SCRIPT), so nothing moves after it.
 * `ch_listen` is written while a recording plays; `ch_read` by the reader.
 */
export interface Stopped {
  to: string;
  title: string;
  sub?: string;
  /** For a recording: which one, and where in it (ms), and how long it is. */
  recording?: string;
  at?: number;
  durationMs?: number;
}

export const LISTEN_COOKIE = 'ch_listen';
export const READ_COOKIE = 'ch_read';

/** A path on this site: one slash, then not another (//other.site and /\\other.site are other sites). */
const SITE_PATH = /^\/(?![/\\])/;

/** A cookie's value read from a request's Cookie header, as the shape above; null when missing or broken. */
export function readStopped(cookies: string | null, name: string): Stopped | null {
  const raw = cookies
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Stopped;
    return typeof value.to === 'string' && SITE_PATH.test(value.to) && typeof value.title === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** The recording page, opened at the part and the second where the reader stopped (?r=rh-…&t=seconds). */
export function resumeLink(stopped: Stopped): string {
  if (!stopped.recording) return stopped.to;
  return `${stopped.to}?r=${encodeURIComponent(stopped.recording)}&t=${Math.floor((stopped.at ?? 0) / 1000)}`;
}

