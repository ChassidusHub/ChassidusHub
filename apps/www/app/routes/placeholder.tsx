import type { ReactNode } from 'react';
import { TopBar, type PathLevel } from '../ui';

/**
 * What an empty screen shows until its thread builds it from the prototype.
 * Each route below is one screen and belongs to one screen thread
 * (apps/www/README.md); replace the placeholder, keep the route. A page
 * that is not there uses the same frame, with no note (routes/item.tsx).
 */
export function Placeholder({ title, path, note = 'המסך הזה עוד בבנייה.', children }: { title: string; path?: PathLevel[]; note?: string; children?: ReactNode }) {
  return (
    <>
      <TopBar path={path} title={path ? undefined : title} />
      <main id="content" className="view">
        <h1>{title}</h1>
        {note && <p className="faint">{note}</p>}
        {children}
      </main>
    </>
  );
}
