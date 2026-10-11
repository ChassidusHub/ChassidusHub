import { Placeholder } from './placeholder';
import type { Route } from './+types/listen';

export const handle = { section: 'listen' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'שמיעה · ChassidusHub' }];
}

/** Listening: recordings by year and event (thread 1, Home and listening). */
export default function Screen() {
  return <Placeholder title="שמיעה" />;
}
