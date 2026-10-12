import type { DrawnWords } from './words.server';

/**
 * A page's drawn words from their own address (routes/words.ts). The address
 * changes whenever the words do, so whatever answers it, the browser's cache
 * or the service worker's, is never out of date.
 */
export async function keptWords(url: string): Promise<DrawnWords> {
  const response = await fetch(url);
  if (!response.ok) throw new Response('the words could not be read', { status: response.status || 503 });
  return (await response.json()) as DrawnWords;
}

/**
 * Keeps a whole page's words at their address too, once the page is quiet,
 * so a later click back to it reads them from the service worker. Only where
 * a service worker already looks after this page: on a first visit it would
 * only fetch the words twice.
 */
export function keepWords(url: string): () => void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return () => {};
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
  const cancel = window.cancelIdleCallback ?? window.clearTimeout;
  const handle = idle(() => void fetch(url, { priority: 'low' } as RequestInit).catch(() => undefined));
  return () => cancel(handle);
}
