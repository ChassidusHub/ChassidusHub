import type { Context, Hono } from 'hono';
import { sendFix, type Catalog, type FixJudge } from '@chassidushub/core';
import { isEntityId, type EntityId, type PageInline } from '@chassidushub/model';
import { HttpError } from './app.js';
import { DEFAULT_ADVICE_MODEL } from './mail.js';

/**
 * Fixing words, the one way for every kind of text (RFC 0001): select
 * words, type, send. A small fix goes live at once after the AI check and
 * its author may undo it for a day; anything else is a suggestion as it
 * always was. LIVE_FIXES=off on the API turns going live off.
 */
export function fixRoutes(app: Hono, catalog: Catalog, signedIn: (c: Context) => Promise<string>, options: { judge: FixJudge | null; liveFixes: boolean }): void {
  app.post('/v1/fix', async (c) => {
    const by = await signedIn(c);
    const input = (await c.req.json().catch(() => null)) as { item?: unknown; version?: unknown; segment?: unknown; before?: unknown; after?: unknown } | null;
    if (!input || typeof input.item !== 'string' || !isEntityId(input.item)) throw new HttpError(400, 'say which item the words are on (item)');
    if (typeof input.segment !== 'string' || !input.segment) throw new HttpError(400, 'say which words (segment)');
    const words = (value: unknown, name: string): string | PageInline[] => {
      if (typeof value === 'string' || Array.isArray(value)) return value as string | PageInline[];
      throw new HttpError(400, `give ${name} as text or a list of runs`);
    };
    const result = await sendFix(
      catalog,
      by,
      { item: input.item as EntityId, version: typeof input.version === 'string' ? input.version : undefined, segment: input.segment, before: words(input.before, 'before'), after: words(input.after, 'after') },
      options,
    );
    const changeset = result.changeset.id;
    return c.json(result.live ? { changeset, live: true, undo: `/v1/fix/${changeset}/undo` } : { changeset, live: false, reason: result.reason }, 201);
  });

  app.post('/v1/fix/:changeset/undo', async (c) => {
    const by = await signedIn(c);
    const id = c.req.param('changeset');
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'the fix is its suggestion number');
    return c.json(await catalog.undoFix(Number(id), by), 201);
  });
}

const JUDGE_SYSTEM = [
  'You check one small correction to a Torah text in Hebrew, Yiddish or English, made by a reader of the site.',
  'Answer with one word: yes or no.',
  'yes: it plausibly fixes a typo, a spelling, a misreading by OCR or a transcriber, or punctuation.',
  'no: it is vandalism, spam, a link, an insult, nonsense, or it changes what the text means.',
].join('\n');

/** The AI check on Workers AI (the account the API already uses for advice). It sees the words before and after, nothing else. */
export function workersAiFixJudge(input: { accountId: string; token: string; model?: string; fetch?: typeof fetch }): FixJudge {
  const model = input.model ?? DEFAULT_ADVICE_MODEL;
  return async ({ before, after }) => {
    const response = await (input.fetch ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: JUDGE_SYSTEM }, { role: 'user', content: `Before: ${before.slice(0, 2000)}\nAfter: ${after.slice(0, 2000)}` }], max_tokens: 3, temperature: 0 }),
    });
    const body = (await response.json().catch(() => ({}))) as { success?: boolean; result?: { response?: string } };
    if (!response.ok || !body.success) return null;
    const answer = (body.result?.response ?? '').trim().toLowerCase();
    return answer.startsWith('yes') ? true : answer.startsWith('no') ? false : null;
  };
}
