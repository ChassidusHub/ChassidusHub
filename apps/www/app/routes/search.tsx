import { Placeholder } from './placeholder';
import type { Route } from './+types/search';

export const handle = { section: 'search' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'חיפוש · ChassidusHub' }];
}

/** Search and its results (thread 5, Search). */
export default function Screen() {
  return <Placeholder title="חיפוש" />;
}
