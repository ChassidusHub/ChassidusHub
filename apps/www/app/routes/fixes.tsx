import { Placeholder } from './placeholder';
import type { Route } from './+types/fixes';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'התיקונים שלי · ChassidusHub' }];
}

/** The fixes a person made, each with Undo (thread 4, Fixing and Edit). */
export default function Screen() {
  return <Placeholder title="התיקונים שלי" />;
}
