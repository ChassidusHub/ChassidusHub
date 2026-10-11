import { fromThisSite } from '../routes/fix';

/**
 * A pass-through that writes as the person only when the request comes from
 * this site's own pages: another site's form or script cannot use a
 * steward's session to suspend someone or send a plan. The API checks the
 * Origin too; this stops it here first. Reads pass as they are.
 */
export function ownPagesOnly<A extends { request: Request }>(pass: (args: A) => Promise<Response> | Response) {
  return (args: A) =>
    args.request.method === 'GET' || args.request.method === 'HEAD' || fromThisSite(args.request)
      ? pass(args)
      : Response.json({ error: 'refused', message: 'only from this site' }, { status: 403, headers: { 'cache-control': 'no-store' } });
}
