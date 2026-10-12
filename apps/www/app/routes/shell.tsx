import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { AppShell } from '../ui';

/**
 * Every screen sits inside the app shell: the rail or bottom bar, and the player's dock.
 *
 * As soon as the page has painted, the catalog snapshot is read behind it
 * (app/catalog/browser.ts), so the next click into the library or listening
 * is drawn at once, with no server round trip. It starts at the first paint,
 * not seconds later: on slow 4G its manifest and tree (about 90 kB) take a
 * second and a half to arrive, and a person's first tap comes about then
 * (#265). A tap before it has arrived is read from the server, as before.
 */
export default function Shell() {
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (run: () => void, options?: { timeout: number }) => number }).requestIdleCallback ?? ((run: () => void) => setTimeout(run, 0));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => void import('../catalog/browser').then((browser) => browser.warm()).catch(() => undefined);
    // After the next frame is painted, and once the browser has a moment (at most half a second on).
    const frame = requestAnimationFrame(() => (timer = setTimeout(() => idle(start, { timeout: 500 }), 0)));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
