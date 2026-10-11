import type { EditAnswer, EditAsk } from '../edit/types';
import { fromThisSite } from './fix';
import type { Route } from './+types/edit';

const answer = (body: EditAnswer, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * One field of a page, saved from Edit as the person leaves it: the item as
 * it is now, with that field changed, sent as a suggestion in one step
 * (POST /v1/suggestions/quick). It goes live at once for someone the site
 * trusts; anyone else's waits for a second look. If the item changed since
 * the page was opened, nothing is sent.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return answer({ ok: false, why: 'refused' }, 403);
  const ask = (await request.json().catch(() => null)) as EditAsk | null;
  if (!ask || typeof ask.item !== 'string' || ask.field !== 'label' || (ask.language !== 'he' && ask.language !== 'en') || typeof ask.value !== 'string' || typeof ask.before !== 'string') {
    return answer({ ok: false, why: 'refused' }, 400);
  }
  const value = ask.value.replace(/\s+/g, ' ').trim();
  // A page always keeps its Hebrew name; another language's name may be taken away.
  if (!value && ask.language === 'he') return answer({ ok: false, why: 'empty' }, 400);
  if (!context.visitor) return answer({ ok: false, why: 'signin' }, 401);
  try {
    const item = await context.api.getItem({ id: ask.item });
    const label = { ...((item.data as { label?: Record<string, string> }).label ?? {}) };
    if ((label[ask.language] ?? '') !== ask.before || (typeof ask.rev === 'number' && item.rev !== ask.rev)) return answer({ ok: false, why: 'changed' }, 409);
    if (value) label[ask.language] = value;
    else delete label[ask.language];
    const sent = await context.visitor.suggestFix({
      body: { entityId: ask.item, data: { ...(item.data as Record<string, unknown>), label }, title: `השם של הדף: ${value || ask.before}`.slice(0, 200) },
    });
    const live = (sent as { status?: string }).status === 'merged';
    return answer({ ok: true, live, suggestion: (sent as { id: number }).id, ...(live ? { rev: item.rev + 1 } : {}) });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
    if (status === 409) return answer({ ok: false, why: 'changed' }, 409);
    if (status === 400 || status === 403 || status === 404 || status === 422) return answer({ ok: false, why: 'refused' }, status);
    console.error('edit', error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}
