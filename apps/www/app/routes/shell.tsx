import { useEffect } from 'react';
import { Outlet } from 'react-router';
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
 */
export default function Shell() {
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback ?? ((run: () => void) => setTimeout(run, 0));
    let frame: number | undefined;
    const start = () => void import('../catalog/browser').then((browser) => browser.warm()).catch(() => undefined);
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
