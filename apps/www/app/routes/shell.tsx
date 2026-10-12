import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useMatches } from 'react-router';
import { AppShell } from '../ui';

/**
 * Every screen sits inside the app shell: the rail or bottom bar, and the player's dock.
 *
 * As soon as the page has loaded, the catalog snapshot is read behind it
 * (app/catalog/browser.ts), so the next click into the library or listening
 * is drawn at once, with no server round trip. It starts at the page's load
 * event, not seconds later: on slow 4G its manifest and tree (about 90 kB)
 * take a second and a half to arrive, and a person's first tap comes about
 * then (#265). Not before the load event, so it never competes with the
 * page's own scripts (and stays outside the page budgets, e2e/pages.spec.ts).
 * A tap before it has arrived is read from the server, as before.
 *
 * It reads the small cut: the index and the top file, then the file of the
 * top shelf this page is under, the first level of its path bar (`topShelf`).
 * Each page a person moves to asks again, so a cold link (from search, say)
 * that the server drew still has its shelf read for the next tap. The page
 * carries the index (app/root.tsx), so the top file and the shelf's file are
 * asked for at once (`ask`), while the snapshot's script is still coming.
 */
export default function Shell() {
  const { pathname } = useLocation();
  const shelf = topShelf(useMatches());
  const loaded = useRef(false);
  // A move within the site: the snapshot's core is read already, only the page's shelf (if new) is fetched.
  useEffect(() => {
    if (!loaded.current) return;
    void import('../catalog/browser').then((browser) => browser.warm(shelf)).catch(() => undefined);
  }, [pathname, shelf]);
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback ?? ((run: () => void) => setTimeout(run, 0));
    let frame: number | undefined;
    const start = () => {
      loaded.current = true;
      ask(shelf);
      void import('../catalog/browser').then((browser) => browser.warm(shelf, true)).catch(() => undefined);
    };
    // After the next frame is painted, and once the browser has a moment (at most half a second on).
    const begin = () => (frame = requestAnimationFrame(() => idle(start, { timeout: 500 })));
    if (document.readyState === 'complete') begin();
    else addEventListener('load', begin, { once: true });
    return () => {
      removeEventListener('load', begin);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** A route's path bar, as its data carries it: `pathBar` (item, reader) or `levels` (library), at the top of the data or one down. */
type Level = { kind?: string; chosen?: { id?: string } };
function levelsIn(data: unknown): Level[] | null {
  if (!data || typeof data !== 'object') return null;
  for (const from of [data, ...Object.values(data)]) {
    if (!from || typeof from !== 'object') continue;
    const found = (from as { pathBar?: unknown }).pathBar ?? (from as { levels?: unknown }).levels;
    if (Array.isArray(found) && found.length && typeof found[0] === 'object') return found as Level[];
  }
  return null;
}

/** The id of the top shelf the page is under: the first level of the deepest route's path bar, if a shelf. */
function topShelf(matches: ReturnType<typeof useMatches>): string | null {
  for (const match of [...matches].reverse()) {
    const first = levelsIn(match.data)?.[0];
    if (first) return first.kind === 'set' ? (first.chosen?.id ?? null) : null;
  }
  return null;
}

/**
 * Asks for the top file and the shelf's file named in the index the page
 * carries, now, so they are on their way while the snapshot's script comes;
 * that script reads them from the browser's cache (they never change).
 */
function ask(shelf: string | null) {
  if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
  try {
    const index = JSON.parse(document.getElementById('catalog-index')?.textContent || 'null') as { format?: number; top?: string; shelves?: Record<string, string> } | null;
    if (index?.format !== 2) return;
    for (const name of [index.top, shelf ? index.shelves?.[shelf] : undefined]) if (name) void fetch(`/_/catalog/${encodeURIComponent(name)}`, { credentials: 'omit' }).catch(() => undefined);
  } catch {
    // An index that cannot be read: the snapshot's script asks for it.
  }
}

