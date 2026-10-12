/**
 * The site's service worker: what the browser keeps so a page opens at once,
 * the second time and offline (studio/plans/www-instant.md).
 *
 * Here, the pages with nothing of their own to read before they show: About,
 * Search, signing in and the frames of the account, inbox and back room. They
 * are the same for everyone (the person's own data is read by the page after
 * it shows), so one copy serves anyone on this browser. A kept page is shown
 * at once and fetched again behind it; the next visit gets the new one.
 *
 * The built files (/assets/…) never change under a name, so once fetched
 * they are kept and never asked for again.
 *
 * Texts and the catalog are kept by their own section ("Fast site: texts
 * cached and offline"), added below this one.
 */

const PAGES = 'pages-v1';
const ASSETS = 'assets-v1';
const KEPT = [PAGES, ASSETS];

/** The pages kept from the first visit on, so the first click to one is already instant. */
const SHELL = ['/about', '/search', '/signin', '/account', '/inbox', '/back', '/takedown'];

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

/** The page drawn now, kept for next time; when its build is new, the pages kept from the old build are let go. */
async function refresh(request, kept) {
  const page = await fetch(request);
  if (!keepable(page)) return page;
  const pages = await caches.open(PAGES);
  const now = (await page.clone().text()).match(BUILD)?.[0];
  const before = kept && (await kept.clone().text()).match(BUILD)?.[0];
  if (now && before && now !== before) for (const old of await pages.keys()) await pages.delete(old);
  await pages.put(request.url, page.clone());
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
        const fresh = refresh(request, kept);
        if (!kept) return fresh;
        event.waitUntil(fresh.catch(() => null));
        return kept;
      }),
    );
  }
});
