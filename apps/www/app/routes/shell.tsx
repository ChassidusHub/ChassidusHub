import { Outlet } from 'react-router';
import { AppShell } from '../ui';

/** Every screen sits inside the app shell: the rail or bottom bar, and the player's dock. */
export default function Shell() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
