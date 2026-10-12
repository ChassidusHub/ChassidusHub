/**
 * How long a page took and where the time went, said in its Server-Timing
 * header, so a page's speed can be read in any browser's network panel or
 * with curl from now on (docs/operations.md):
 *
 * - `page`: the whole page, from the request to the answer.
 * - `api`: the time the page waited on the API, `desc` saying how many calls
 *   it made in how many rounds (a round is calls made side by side; each one
 *   after another is a round more, and each round is a trip to the API).
 * - `db`: what the API said those calls cost the database, summed.
 * - `drawn`: on a page kept at the edge (server/edge.ts), when it was drawn
 *   and how long that took; the `api` and `db` after it are of that drawing.
 *   A page whose `drawn` is older than this request came from the edge, and
 *   nothing was asked of the API for it now.
 */

type Send = (input: string, init?: RequestInit) => Promise<Response>;

export interface PageTiming {
  /** The API's fetch, timed: what a page's API calls go through. */
  timed(send: Send): Send;
  /** The header for a page drawn in `total` milliseconds; `name` is `page`, or `drawn` for a page the edge will keep. */
  header(total: number, name?: 'page' | 'drawn'): string;
}

/** The milliseconds a Server-Timing header gives for one of its names. */
function durationOf(header: string | null, name: string): number {
  const found = header && new RegExp(`(?:^|,)\\s*${name};[^,]*?dur=([\\d.]+)`).exec(header);
  return found ? Number(found[1]) : 0;
}

const ms = (value: number) => Math.round(value * 10) / 10;

/** A page's timing; `now` is for tests (performance.now, which on Workers moves only across I/O, as these calls are). */
export function pageTiming(now: () => number = () => performance.now()): PageTiming {
  let calls = 0;
  let rounds = 0;
  let inFlight = 0;
  let waited = 0;
  let since = 0;
  let db = 0;
  return {
    timed: (send) => async (input, init) => {
      calls += 1;
      if (inFlight++ === 0) {
        rounds += 1;
        since = now();
      }
      try {
        const answer = await send(input, init);
        db += durationOf(answer.headers.get('server-timing'), 'db');
        return answer;
      } finally {
        if (--inFlight === 0) waited += now() - since;
      }
    },
    header(total, name = 'page') {
      const parts = [name === 'drawn' ? `drawn;dur=${ms(total)};desc="${new Date().toISOString()}"` : `page;dur=${ms(total)}`];
      if (calls) {
        parts.push(`api;dur=${ms(waited)};desc="${calls} call${calls === 1 ? '' : 's'}, ${rounds} round${rounds === 1 ? '' : 's'}"`);
        if (db) parts.push(`db;dur=${ms(db)}`);
      } else parts.push('api;desc="no calls"');
      return parts.join(', ');
    },
  };
}

/** A response with its Server-Timing header set, whatever headers it came with (one from the edge may not be changed in place). */
export function withTiming(response: Response, header: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Server-Timing', header);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
