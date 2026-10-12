import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { AppShell } from '../ui';

/**
 * Every screen sits inside the app shell: the rail or bottom bar, and the player's dock.
 *
 * Once the page has drawn and the browser is idle, the catalog snapshot is read
 * behind it (app/catalog/browser.ts), so the next click into the library or
 * listening is drawn at once, with no server round trip. It waits a few
 * seconds, so it never competes with the page itself.
 */
export default function Shell() {
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (run: () => void) => number }).requestIdleCallback ?? ((run: () => void) => setTimeout(run, 0));
    const timer = setTimeout(() => idle(() => void import('../catalog/browser').then((browser) => browser.warm()).catch(() => undefined)), 3000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
