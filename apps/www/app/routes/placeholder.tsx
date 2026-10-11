import type { ReactNode } from 'react';
import { TopBar, type PathLevel } from '../ui';

/**
 * What an empty screen shows until its thread builds it from the prototype.
 * Each route below is one screen and belongs to one screen thread
 * (apps/www/README.md); replace the placeholder, keep the route.
 */
export function Placeholder({ title, path, children }: { title: string; path?: PathLevel[]; children?: ReactNode }) {
  return (
    <>
      <TopBar path={path} title={path ? undefined : title} />
      <main id="content" className="view">
        <h1>{title}</h1>
        <p className="faint">המסך הזה עוד בבנייה.</p>
        {children}
      </main>
    </>
  );
}
