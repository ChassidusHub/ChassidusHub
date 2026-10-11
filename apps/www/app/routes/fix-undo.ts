import type { UndoAnswer } from '../fix/types';
import { fromThisSite } from './fix';
import type { Route } from './+types/fix-undo';

const answer = (body: UndoAnswer, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Undo, from the toast after a live fix (and later from the person's own
 * fixes): POST /v1/fix/{changeset}/undo as the person. The API allows it for
 * a day, while nobody changed those words since; after that it is a
 * reviewer's revert.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return answer({ ok: false, why: 'refused' }, 403);
  const changeset = Number(params.changeset);
  if (!Number.isInteger(changeset) || changeset <= 0) return answer({ ok: false, why: 'refused' }, 400);
  if (!context.visitor) return answer({ ok: false, why: 'signin' }, 401);
  try {
    await context.visitor.undoFix({ changeset });
    return answer({ ok: true });
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
    // Too late, someone changed the words since, or it was not live: a reviewer's to revert now.
    if (status === 400 || status === 403 || status === 409) return answer({ ok: false, why: 'late' }, 409);
    if (status === 404) return answer({ ok: false, why: 'refused' }, 404);
    console.error('undo fix', error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}
