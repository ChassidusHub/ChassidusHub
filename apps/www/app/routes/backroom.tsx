import { Placeholder } from './placeholder';
import type { Route } from './+types/backroom';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'החדר האחורי · ChassidusHub' }];
}

/** The back room: keep or undo what went live, machine text nobody checked (thread 6). */
export default function Screen() {
  return <Placeholder title="החדר האחורי" />;
}
