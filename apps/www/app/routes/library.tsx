import { Placeholder } from './placeholder';
import type { Route } from './+types/library';

export const handle = { section: 'library' };

export function meta(_: Route.MetaArgs) {
  return [{ title: 'ספרייה · ChassidusHub' }];
}

/** The library: the Rebbeim and their sefarim, from the fixed catalog tree (thread 2, Library). */
export default function Screen() {
  return <Placeholder title="ספרייה" />;
}
