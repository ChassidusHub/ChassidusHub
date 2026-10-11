import { describeDateKey } from '@chassidushub/hebrew';
import { nameOf } from '../lib/catalog';
import { KINDS } from '../stewards/organize';
import type { Route } from './+types/find';

/** One item found by name, as the pickers of /organize, /add and /showcase list it. */
export interface Found {
  id: string;
  type: string;
  path: string | null;
  label: string;
  /** Its kind and date, or its address: the quiet line under it. */
  sub: string;
}

const TYPES = new Set(['set', 'work', 'unit', 'event', 'recording', 'publication']);

/**
 * A few items by name or date, for the pickers that link one item to another
 * (the set to move rows into, the place a file belongs, a farbrengen for a
 * showcase): GET /_/find?q=…&type=…, from the API's search. The same for
 * everyone, so kept for a minute. `/_/lookup` is the same answer.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const type = url.searchParams.get('type') ?? undefined;
  const headers = { 'Cache-Control': 'public, max-age=60, s-maxage=300' };
  if (q.length < 2 || (type && !TYPES.has(type))) return Response.json({ items: [] satisfies Found[] }, { headers });
  const { results } = await context.api.search({ q, ...(type ? { type } : {}), limit: 12 }).catch(() => ({ results: [] }));
  const items: Found[] = results.map((item) => {
    const data = item.data as { name?: unknown; title?: unknown; label?: unknown; date?: string };
    const date = typeof data.date === 'string' ? describeDateKey(data.date) : '';
    return { id: item.id, type: item.type, path: item.path, label: nameOf(data.name ?? data.title ?? data.label, item.id), sub: [KINDS[item.type] ?? '', date].filter(Boolean).join(' · ') };
  });
  return Response.json({ items }, { headers });
}
