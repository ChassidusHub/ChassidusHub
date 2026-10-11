import { Placeholder } from './placeholder';
import type { Route } from './+types/signin';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'כניסה · ChassidusHub' }];
}

/** Signing in (thread 6, back room and the rest). */
export default function Screen() {
  return <Placeholder title="כניסה" />;
}
