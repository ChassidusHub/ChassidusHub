import { nameField } from '../edit/names';
import type { EditAnswer, EditAsk } from '../edit/types';
import { fromThisSite } from './fix';
import type { Route } from './+types/edit';

const answer = (body: EditAnswer, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * One field of a page, saved from Edit as the person leaves it. A name is
 * changed by a rename (POST /v1/organize): only the name is sent, never the
 * item's whole data, so nothing else on the page (its words, whatever a
 * public read leaves out) can be lost by it. It is approved at once where
 * the person may approve it themselves; anyone else's waits for a second
 * look. If the name changed since the page was opened, nothing is sent.
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
    const name = nameField(item.data);
    if ((typeof name[ask.language] === 'string' ? name[ask.language] : '') !== ask.before || (typeof ask.rev === 'number' && item.rev !== ask.rev)) return answer({ ok: false, why: 'changed' }, 409);
    const sent = await context.visitor.organize({
      body: { operations: [{ op: 'rename', item: ask.item, name: { [ask.language]: value } }], title: `השם של הדף: ${value || ask.before}`.slice(0, 200), apply: true },
    });
    const live = sent.merged;
    return answer({ ok: true, live, suggestion: sent.suggestion.id, ...(live ? { rev: item.rev + 1 } : {}) });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
    if (status === 409) return answer({ ok: false, why: 'changed' }, 409);
    if (status === 400 || status === 403 || status === 404 || status === 422) return answer({ ok: false, why: 'refused' }, status);
    console.error('edit', error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}
