import { ownPagesOnly } from '../stewards/pass.server';
import { passTo } from './auth';
import type { Route } from './+types/organize-pass';

/**
 * The organizing page's calls, as the person, never kept: /_/organize sends
 * the plan as one Suggestion (POST /v1/organize), /_/organize/preview shows it
 * first, /_/organize/tree reads a level of the tree for the path bar, and
 * /_/organize/approve/<id> approves it at once for a steward who may. Only
 * these pass, each with its own method.
 */
const plan = passTo('/v1/organize', /^(preview)?$/);
const tree = passTo('/v1/tree', /^$/);
const approve = passTo('/v1/suggestions', /^\d+\/approve$/);

async function pass(args: Route.LoaderArgs | Route.ActionArgs) {
  const path = args.params['*'] ?? '';
  const post = args.request.method === 'POST';
  if (path === 'tree' && !post) return tree({ ...args, params: { '*': '' } });
  const approving = /^approve\/(\d{1,9})$/.exec(path);
  if (approving && post) return approve({ ...args, params: { '*': `${approving[1]}/approve` } });
  if ((path === '' || path === 'preview') && post) return plan(args);
  return new Response('Not found', { status: 404 });
}

export const loader = pass;
export const action = ownPagesOnly(pass);
