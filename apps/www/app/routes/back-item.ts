import { wordsOf, type FieldChange } from '../back/words';
import { fromThisSite } from './fix';
import type { Route } from './+types/back-item';

/** What one live change in the back room did, as its card shows it. */
export interface LiveChange {
  ok: true;
  /** The items it changed, each with its words compared. */
  items: { id: string; path: string | null; words: ReturnType<typeof wordsOf> }[];
  /** Whether the person asking may keep or undo it, and if not, why. */
  may: boolean;
}

export type Decided = { ok: true; undone: boolean } | { ok: false; why: 'signin' | 'refused' | 'done' | 'down' };

const answer = (body: LiveChange | Decided | { ok: false; why: string }, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * One live change's words, read as the person (so the answer says whether
 * they may decide it): GET /v1/suggestions/:id with its facts only, a few
 * items at most. Never kept: who may decide is personal.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return answer({ ok: false, why: 'refused' }, 400);
  try {
    const view = (await (context.visitor ?? context.api).getSuggestion({ id, brief: '1', limit: 5 })) as {
      entries?: { entityId: string; changes?: FieldChange[]; after?: { path?: string } | null; before?: { path?: string } | null }[];
      mayApprove?: { ok: boolean };
    };
    const items = (view.entries ?? []).map((entry) => ({ id: entry.entityId, path: entry.after?.path ?? entry.before?.path ?? null, words: wordsOf(entry.changes ?? []) }));
    return answer({ ok: true, items, may: Boolean(view.mayApprove?.ok) });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 404) return answer({ ok: false, why: 'refused' }, 404);
    console.error('back', error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}

/** Keep it or undo it (POST /v1/suggestions/:id/review-live), as the person, from this site's own pages only. */
export async function action({ request, params, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return answer({ ok: false, why: 'refused' }, 403);
  const id = Number(params.id);
  const { verdict } = ((await request.json().catch(() => ({}))) ?? {}) as { verdict?: unknown };
  if (!Number.isInteger(id) || id < 1 || (verdict !== 'approve' && verdict !== 'revert')) return answer({ ok: false, why: 'refused' }, 400);
  if (!context.visitor) return answer({ ok: false, why: 'signin' }, 401);
  try {
    await context.visitor.reviewLive({ id, body: { verdict } });
    return answer({ ok: true, undone: verdict === 'revert' });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
    if (status === 403) return answer({ ok: false, why: 'refused' }, 403);
    if (status === 409) return answer({ ok: false, why: 'done' }, 409);
    if (status === 400) return answer({ ok: false, why: 'refused' }, 400);
    console.error('back', error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}
