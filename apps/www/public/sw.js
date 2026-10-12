/**
 * The site's service worker: what the browser keeps so a page opens at once,
 * the second time and offline (studio/plans/www-instant.md).
 *
 * Here, the pages with nothing of their own to read before they show: About,
 * Search, signing in and the frames of the account and inbox. They
 * are the same for everyone (the person's own data is read by the page after
 * it shows), so one copy serves anyone on this browser. A kept page is shown
 * at once and fetched again behind it; the next visit gets the new one.
 *
 * The built files (/assets/…) never change under a name, so once fetched
 * they are kept and never asked for again.
 *
 * Texts, and the last copy of every other page read, are kept by their own
 * section below ("Fast site: texts cached and offline").
 */

const PAGES = 'pages-v1';
const ASSETS = 'assets-v1';
const KEPT = [PAGES, ASSETS];

/** The pages kept from the first visit on, so the first click to one is already instant. */
// Not the back room: its page carries the keepers' lists streamed into it, which must never be shown stale.
const SHELL = ['/about', '/search', '/signin', '/account', '/inbox', '/takedown'];

/** The built entry a page loads; a new one means a new build, and the pages kept from the old one are let go. */
const BUILD = /\/assets\/manifest-[\w-]+\.js/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((pages) => Promise.allSettled(SHELL.map((path) => fetch(path, { credentials: 'omit' }).then((page) => (keepable(page) ? pages.put(path, page) : null)))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !KEPT.includes(name) && !name.startsWith('texts-')).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** Only a whole, public page is kept: never one drawn for someone (private, no-store, a cookie set). */
function keepable(page) {
  if (!page.ok || page.redirected || page.type === 'opaqueredirect' || page.headers.has('Set-Cookie')) return false;
  return !/private|no-store/i.test(page.headers.get('Cache-Control') || '');
}

/** Keeps a page drawn now for next time; when its build is new, the pages kept from the old build are let go. */
async function keep(url, page, kept) {
  const pages = await caches.open(PAGES);
  const now = (await page.clone().text()).match(BUILD)?.[0];
  const before = kept && (await kept.clone().text()).match(BUILD)?.[0];
  if (now && before && now !== before) for (const old of await pages.keys()) await pages.delete(old);
  await pages.put(url, page);
}

/** The page drawn now, handed over as it streams; kept behind it, never waited for. */
async function refresh(event, kept) {
  const page = await fetch(event.request);
  if (keepable(page)) event.waitUntil(keep(event.request.url, page.clone(), kept).catch(() => null));
  return page;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (assets) => {
        const kept = await assets.match(request);
        if (kept) return kept;
        const fetched = await fetch(request);
        if (fetched.ok) await assets.put(request, fetched.clone());
        return fetched;
      }),
    );
    return;
  }

  // Only the bare page: an address with a question (a search, ?tab=) is drawn now, never kept.
  if (request.mode === 'navigate' && SHELL.includes(url.pathname) && !url.search) {
    event.respondWith(
      caches.match(request.url, { cacheName: PAGES }).then((kept) => {
        const fresh = refresh(event, kept);
        if (!kept) return fresh;
        event.waitUntil(fresh.catch(() => null));
        return kept;
      }),
    );
    return;
  }

  texts(event, request, url);
});

/*
 * Texts (studio/plans/www-instant.md, item C).
 *
 * A sicha's words are at an address made from the words themselves
 * (/_/words/<id>/<key>, routes/words.ts), which never holds anything else:
 * once read they are kept and never asked for again, so a sicha read before
 * opens at once, and offline.
 *
 * Every other page read, and a click's data for it (<path>.data), comes from
 * the network, so it is always the newest; the last copy is kept, and shown
 * when there is no network, or when the network is slower than PATIENCE_MS.
 * Never kept: what is one person's own or sent as them (the account, the
 * inbox, signing in, the back room, /_/…), Edit (?edit), and search, whose
 * answers are drawn for each question and are not reading.
 */

const WORDS = 'texts-words-v1';
const READ = 'texts-pages-v1';

/** How many sichos' words and how many pages are kept; past that, the oldest go first. */
const KEEP_WORDS = 2000;
const KEEP_PAGES = 300;

/** How long a page waits on the network before showing the copy kept of it, if there is one. */
const PATIENCE_MS = 4000;

/** Pages that are one person's own, a step of signing in, or a search. */
const PERSONAL = /^\/(?:search|account|me|inbox|signin|connect|oauth|back|review|admin|organize|add|new|showcase|show|edit)(?:\/|\.data$|$)/;

/** What this section does with a request: 'words', 'page', or nothing. */
function textsAnswer(request, url) {
  const path = url.pathname;
  if (path.startsWith('/_/words/')) return 'words';
  if (path.startsWith('/_/') || path === '/sw.js' || PERSONAL.test(path) || url.searchParams.has('edit')) return null;
  if (request.mode === 'navigate' || path.endsWith('.data')) return 'page';
  return null;
}

function texts(event, request, url) {
  const answer = textsAnswer(request, url);
  if (answer === 'words') event.respondWith(keptWords(event, request));
  else if (answer === 'page') event.respondWith(newestPage(event, request));
}

/** Whole, from this site, not sent on elsewhere, and not marked never to keep. */
function mayKeep(response) {
  return response.status === 200 && response.type === 'basic' && !response.redirected && !/no-store/i.test(response.headers.get('Cache-Control') || '');
}

/** Puts a copy in a cache and lets the oldest go past `limit`, after the answer has gone. */
function keepCopy(event, name, request, response, limit) {
  const copy = response.clone();
  event.waitUntil(
    caches.open(name).then(async (cache) => {
      await cache.put(request, copy);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
    }),
  );
}

async function keptWords(event, request) {
  const kept = await caches.match(request, { cacheName: WORDS });
  if (kept) return kept;
  const response = await fetch(request);
  if (mayKeep(response)) keepCopy(event, WORDS, request, response, KEEP_WORDS);
  return response;
}

async function newestPage(event, request) {
  const fresh = fetch(request).then((response) => {
    if (mayKeep(response)) keepCopy(event, READ, request, response, KEEP_PAGES);
    return response;
  });
  event.waitUntil(fresh.catch(() => null));
  const slow = new Promise((resolve) => setTimeout(() => resolve(caches.match(request, { cacheName: READ })), PATIENCE_MS));
  try {
    return (await Promise.race([fresh, slow])) || (await fresh);
  } catch {
    const kept = await caches.match(request, { cacheName: READ });
    if (kept) return kept;
    if (request.mode === 'navigate') return offline();
    throw new Error('offline');
  }
}

/** A page not kept yet, asked for with no network. */
function offline() {
  const html =
    '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אין חיבור · ChassidusHub</title>' +
    '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.6"><h1 style="font-size:1.4rem">אין חיבור לרשת</h1>' +
    '<p>הדף הזה עוד לא נשמר במכשיר. דפים ושיחות שכבר פתחת נפתחים גם בלי רשת.</p><p><a href="/">לדף הבית</a></p></body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
