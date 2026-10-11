import type { Route } from './+types/home';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'ChassidusHub' }];
}

/** A placeholder until the Home screen is built from the prototype. */
export default function Home() {
  return (
    <main>
      <h1>ChassidusHub</h1>
      <p>האתר החדש בבנייה.</p>
    </main>
  );
}
