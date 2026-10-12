/**
 * What the service worker (sw.ts) does with each request. Kept apart from the
 * worker itself, so it can be tested without one.
 *
 * - `shell`: the built files (/assets/*, named by their hash) and the icon:
 *   from the cache, kept since the worker was installed.
 * - `words`: a sicha's words at their own address (routes/words.ts), which
 *   never changes: from the cache once read, so a sicha opens again at once
 *   and offline.
 * - `page`: a page, or a click's data for one (`<path>.data`): from the
 *   network, so it is always the newest; the last copy is kept, and shown
 *   when there is no network (or it is very slow).
 * - `pass`: everything else goes to the network as if there were no worker:
 *   another site, anything but GET, and what belongs to one person or is
 *   sent as them (the account, the inbox, signing in, the back room, /_/…).
 */
export type Answer = 'shell' | 'words' | 'page' | 'pass';

/** Pages that are one person's own, or a step of signing in: never kept. */
const PERSONAL = /^\/(?:account|me|inbox|signin|connect|oauth|back|review|admin|organize|add|new|showcase|show|edit)(?:\/|\.data$|$)/;

export function answerFor(request: { method: string; url: string; mode?: string }, origin: string): Answer {
  if (request.method !== 'GET') return 'pass';
  const url = new URL(request.url);
  if (url.origin !== origin) return 'pass';
  const path = url.pathname;
  if (path.startsWith('/assets/') || path === '/favicon.svg') return 'shell';
  if (path.startsWith('/_/words/')) return 'words';
  if (path.startsWith('/_/') || path === '/sw.js' || PERSONAL.test(path) || url.searchParams.has('edit')) return 'pass';
  if (request.mode === 'navigate' || path.endsWith('.data')) return 'page';
  return 'pass';
}

/** How many pages and how many sichos' words are kept; past that the oldest go first. */
export const KEEP = { pages: 300, words: 2000 };

/** How long a page waits on the network before showing the copy it kept, if it has one. */
export const PATIENCE_MS = 4000;
