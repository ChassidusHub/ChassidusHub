import { Placeholder } from './placeholder';
import type { Route } from './+types/about';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'אודות · ChassidusHub' }];
}

/** About, help and for developers (thread 6). */
export default function Screen() {
  return <Placeholder title="אודות" />;
}
