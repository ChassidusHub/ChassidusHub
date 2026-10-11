import { TopBar } from '../ui';
import type { Route } from './+types/home';

export const handle = { section: 'home' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'ChassidusHub' }];
}

/** A placeholder until the Home screen is built from the prototype. */
export default function Home() {
  return (
    <>
      <TopBar />
      <main id="content" className="view">
        <h1>ChassidusHub</h1>
        <p className="faint">האתר החדש בבנייה.</p>
      </main>
    </>
  );
}
