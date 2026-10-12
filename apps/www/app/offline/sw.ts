import { answerFor, KEEP, PATIENCE_MS } from './policy';

/**
 * The new site's service worker: the built files kept for good once
 * installed, a sicha's words kept once read, and the last copy of every page
 * opened, so reading works without a network and a sicha read before opens
 * again at once (policy.ts says which request gets what). Modelled on the
 * reader app's (reader/apps/web/vite.config.ts), written by hand to keep it
 * small. Built to /sw.js by vite.config.ts, which fills in SHELL and VERSION.
 */

declare const SHELL: string[];
declare const VERSION: string;

/** The parts of the worker's scope this uses (the DOM library has no worker types). */
interface FetchEvent extends Event {
  request: Request;
  respondWith(answer: Promise<Response>): void;
  waitUntil(work: Promise<unknown>): void;
}
interface WorkerScope {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', listener: (event: Event & { waitUntil(work: Promise<unknown>): void }) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}
const scope = self as unknown as WorkerScope;

const SHELL_CACHE = `www-shell-${VERSION}`;
const WORDS_CACHE = 'www-words-v1';
const PAGES_CACHE = 'www-pages-v1';

scope.addEventListener('install', (event) => {
  // One file that fails to come does not stop the rest: it is fetched again when a page asks for it.
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.all(SHELL.map((file) => cache.add(file).catch(() => undefined))))
      .then(() => scope.skipWaiting()),
  );
});

scope.addEventListener('activate', (event) => {
  // Built files of earlier versions are no longer asked for.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('www-shell-') && name !== SHELL_CACHE).map((name) => caches.delete(name))))
      .then(() => scope.clients.claim()),
  );
});

scope.addEventListener('fetch', (event) => {
  const request = event.request;
  const answer = answerFor(request, scope.location.origin);
  if (answer === 'shell') event.respondWith(kept(request, SHELL_CACHE, event));
  else if (answer === 'words') event.respondWith(kept(request, WORDS_CACHE, event, KEEP.words));
  else if (answer === 'page') event.respondWith(newest(request, event));
});

/** Whether an answer may be kept: whole, from this site, not sent on elsewhere, not marked never to keep. */
const keepable = (response: Response) => response.status === 200 && response.type === 'basic' && !response.redirected && !/no-store/i.test(response.headers.get('Cache-Control') ?? '');

/** From the cache when it is there, else from the network, and kept. */
async function kept(request: Request, name: string, event: FetchEvent, limit?: number): Promise<Response> {
  const found = await caches.match(request);
  if (found) return found;
  const response = await fetch(request);
  if (keepable(response)) {
    const copy = response.clone();
    event.waitUntil(caches.open(name).then(async (cache) => {
      await cache.put(request, copy);
      if (limit) await trim(cache, limit);
    }));
  }
  return response;
}

/**
 * From the network, keeping a copy; the kept copy when the network fails,
 * or when it is slower than PATIENCE_MS and there is a copy (the network's
 * answer is still kept for next time).
 */
async function newest(request: Request, event: FetchEvent): Promise<Response> {
  const fresh = fetch(request).then((response) => {
    if (keepable(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES_CACHE).then(async (cache) => {
        await cache.put(request, copy);
        await trim(cache, KEEP.pages);
      }));
    }
    return response;
  });
  event.waitUntil(fresh.catch(() => undefined));
  const slow = new Promise<Response | undefined>((resolve) => setTimeout(async () => resolve(await caches.match(request, { cacheName: PAGES_CACHE })), PATIENCE_MS));
  try {
    const first = await Promise.race([fresh, slow]);
    return first ?? (await fresh);
  } catch {
    const copy = await caches.match(request, { cacheName: PAGES_CACHE });
    if (copy) return copy;
    if (request.mode === 'navigate') return offline();
    throw new Error('offline');
  }
}

/** Past `limit` entries, the oldest kept go first. */
async function trim(cache: Cache, limit: number) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

/** A page not yet kept, asked for with no network. */
function offline(): Response {
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אין חיבור · ChassidusHub</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.4rem">אין חיבור לרשת</h1><p>הדף הזה עוד לא נשמר במכשיר. דפים ושיחות שכבר פתחת נפתחים גם בלי רשת.</p><p><a href="/">לדף הבית</a></p></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
