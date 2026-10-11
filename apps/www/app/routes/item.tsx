import { data, redirect } from 'react-router';
import type { Section } from '../ui';
import { Placeholder } from './placeholder';
import type { Route } from './+types/item';

/** Recordings and the events they were said at belong to listening; every other item to the library. */
const listening = new Set(['event', 'recording']);

/** An item's name in Hebrew where it has one: its title or name, a plain string or one per language. */
function nameOf(fields: Record<string, unknown>): string | undefined {
  for (const value of [fields.title, fields.name]) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const names = value as Record<string, unknown>;
      const found = names.he ?? names.en ?? Object.values(names)[0];
      if (typeof found === 'string') return found;
    }
  }
  return undefined;
}

/**
 * Every item's page, at its readable path (/likkutei-sichos/12/3) or its
 * permanent one (/rh-7k2m9q4d). An old path that moved answers with a
 * permanent redirect to where it is now. The screen depends on the kind of
 * item: a shelf, a sefer or a volume is the Library thread's, a sicha the
 * Reader's, an event or a recording Home and listening's.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const path = decodeURIComponent(new URL(request.url).pathname);
  try {
    const permanent = /^\/(rh-[\w-]+)\/?$/i.exec(path)?.[1];
    const found = permanent ? { id: permanent, redirected: false, path: null } : await context.api.resolvePath({ path });
    if (found.redirected && found.path) throw redirect(found.path, 301);
    const item = await context.api.getItem({ id: found.id });
    return { id: item.id, type: item.type, name: nameOf(item.data) ?? item.id };
  } catch (error) {
    // By its status, not its class: the server's API client and this page's can be two copies of the package.
    if ((error as { status?: number } | null)?.status === 404) throw data('not found', { status: 404 });
    throw error;
  }
}

export const handle = { section: (loaded: Awaited<ReturnType<typeof loader>> | undefined): Section => (loaded && listening.has(loaded.type) ? 'listen' : 'library') };

export function meta({ data: loaded }: Route.MetaArgs) {
  return [{ title: loaded ? `${loaded.name} · ChassidusHub` : 'ChassidusHub' }];
}

export default function Item({ loaderData }: Route.ComponentProps) {
  return (
    <Placeholder title={loaderData.name}>
      <p className="faint sm">
        {loaderData.type} · <bdi>{loaderData.id}</bdi>
      </p>
    </Placeholder>
  );
}
