import { readShaar } from '@chassidushub/model';
import type { ToolAnswer } from '../tools/common';
import { fromThisSite } from './fix';
import type { Route } from './+types/tools-act';

const answer = (body: ToolAnswer, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

const id = (value: unknown): value is string => typeof value === 'string' && /^rh-[\w-]+$/i.test(value);
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const words = (value: unknown, most: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= most;

/**
 * The item tools' writes, sent as the person (their session cookie) from
 * this site's own pages only: a topic or an answer on a talk page, hiding
 * one, an older version sent to be restored, a line of a scan fixed, a
 * page of it confirmed, a layer chosen to start from, OCR uploaded, and a
 * sefer's shaar. Each is a Suggestion, or a comment, as the API makes it;
 * nothing here decides what goes live.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return answer({ ok: false, why: 'refused' }, 403);
  const ask = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const visitor = context.visitor;
  if (!visitor) return answer({ ok: false, why: 'signin' }, 401);
  try {
    switch (params.what) {
      case 'talk': {
        if (!id(ask.item) || !words(ask.body, 10_000) || (ask.parent !== undefined && !whole(ask.parent))) break;
        const sent = await visitor.commentOnItem({ id: ask.item, body: { body: ask.body.trim(), ...(ask.parent ? { parent: ask.parent } : {}) } });
        return answer({ ok: true, id: sent.id });
      }
      case 'hide': {
        if (!whole(ask.comment)) break;
        await visitor.hideComment({ id: ask.comment });
        return answer({ ok: true });
      }
      case 'restore': {
        if (!id(ask.item) || !whole(ask.rev)) break;
        const sent = await visitor.restoreItem({ id: ask.item, body: { rev: ask.rev } });
        return answer({ ok: true, suggestion: sent.suggestion });
      }
      case 'line': {
        if (!id(ask.scan) || !whole(ask.page) || !words(ask.line, 200) || !words(ask.text, 2000)) break;
        const sent = await visitor.fixScanLine({ id: ask.scan, body: { page: ask.page, line: ask.line, text: ask.text.trim() } });
        return answer({ ok: true, suggestion: sent.id });
      }
      case 'confirm': {
        if (!id(ask.scan) || !whole(ask.page)) break;
        const sent = await visitor.confirmScanPage({ id: ask.scan, body: { page: ask.page } });
        return answer({ ok: true, suggestion: sent.id });
      }
      case 'seed': {
        if (!id(ask.scan) || !words(ask.layer, 200)) break;
        await visitor.seedScanText({ id: ask.scan, body: { layer: ask.layer } });
        return answer({ ok: true });
      }
      case 'ocr': {
        if (!id(ask.scan) || !words(ask.content, 5_000_000) || !words(ask.engine, 80) || !words(ask.version, 40)) break;
        const first = whole(ask.firstPage) ? ask.firstPage : 1;
        await visitor.uploadOcr({ id: ask.scan, body: { content: ask.content, engine: { name: ask.engine.trim(), version: ask.version.trim() }, firstPage: first } });
        return answer({ ok: true });
      }
      case 'shaar': {
        if (!id(ask.item) || typeof ask.text !== 'string' || ask.text.length > 200_000 || typeof ask.before !== 'string') break;
        // Read here first, so every line the catalog cannot read is named before anything is sent.
        const reading = readShaar(ask.text);
        if (!reading.ok) return answer({ ok: false, why: 'problems', problems: reading.problems.map((p) => ({ line: p.line, he: p.he })) }, 422);
        const note = typeof ask.note === 'string' && ask.note.trim() ? ask.note.trim().slice(0, 2000) : undefined;
        const sent = (await visitor.suggestShaar({ body: { entityId: ask.item, text: ask.text, before: ask.before, title: 'השער', ...(note ? { note } : {}) } })) as { id?: number };
        return answer({ ok: true, suggestion: sent.id ?? null });
      }
    }
    return answer({ ok: false, why: 'refused' }, 400);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    const message = (error as { message?: unknown } | null)?.message;
    if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
    if (status === 409) return answer({ ok: false, why: 'changed' }, 409);
    if (status === 429) return answer({ ok: false, why: 'busy' }, 429);
    if (status === 400 || status === 403 || status === 404 || status === 422) return answer({ ok: false, why: 'refused', ...(typeof message === 'string' && message ? { message: message.slice(0, 200) } : {}) }, status);
    console.error('tools', params.what, error);
    return answer({ ok: false, why: 'down' }, 502);
  }
}
