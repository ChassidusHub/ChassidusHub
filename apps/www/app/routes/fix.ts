import type { PageSegment } from '@chassidushub/model';
import type { AppLoadContext } from 'react-router';
import { replaceInRuns, replaceInText } from '../fix/replace';
import type { FixAnswer, FixAsk } from '../fix/types';
import { noteLabels } from '../reader/words.server';
import type { Route } from './+types/fix';

/**
 * A fix, sent from the page (app/fix): the words the person selected, where,
 * and what they typed. The page knows only what it drew, so the segment's
 * words before and after are made here from one read of the item, and sent
 * to POST /v1/fix as the person (their session cookie). The API decides
 * whether it goes live at once (a few words, after the AI check) or waits
 * for a reviewer, and answers with how to undo it.
 */
export async function action({ request, context }: Route.ActionArgs) {
  if (!fromThisSite(request)) return answer({ ok: false, why: 'refused' }, 403);
  const ask = (await request.json().catch(() => null)) as FixAsk | null;
  if (!ask || typeof ask.item !== 'string' || typeof ask.segment !== 'string' || typeof ask.selected !== 'string' || typeof ask.words !== 'string' || typeof ask.at !== 'number') {
    return answer({ ok: false, why: 'refused' }, 400);
  }
  const words = ask.words.replace(/\s+/g, ' ').trim();
  if (!words) return answer({ ok: false, why: 'empty' }, 400);
  if (!context.visitor) return answer({ ok: false, why: 'signin' }, 401);

  let segment: { before: unknown; after: unknown; version?: string };
  try {
    const found = await beforeAndAfter(context, ask, words);
    if (typeof found === 'string') return answer({ ok: false, why: found === 'not-words' ? 'not-words' : 'changed' }, 409);
    segment = found;
  } catch (error) {
    return failed(error);
  }
  try {
    const sent = await context.visitor.fix({
      body: { item: ask.item, ...(segment.version ? { version: segment.version } : {}), segment: ask.segment, before: segment.before as Record<string, unknown>, after: segment.after as Record<string, unknown> },
    });
    return answer({ ok: true, changeset: sent.changeset, live: sent.live, ...(sent.reason ? { reason: sent.reason } : {}) });
  } catch (error) {
    return failed(error);
  }
}

/** The segment's words as they are now, and with the person's words in place of the ones they selected. */
async function beforeAndAfter(context: AppLoadContext, ask: FixAsk, words: string): Promise<{ before: unknown; after: unknown; version?: string } | 'moved' | 'not-words'> {
  if (ask.kind === 'transcript') {
    const transcript = (await context.api.recordingTranscript({ id: ask.item })) as unknown as { paragraphs: { id: string; content: string }[] };
    const paragraph = transcript.paragraphs.find((p) => p.id === ask.segment);
    if (!paragraph) return 'moved';
    const after = replaceInText(paragraph.content, ask.at, ask.selected, words);
    return typeof after === 'string' ? { before: paragraph.content, after } : after;
  }
  const view = await context.api.itemView({ id: ask.item, ...(ask.version ? { language: ask.version } : {}) });
  const text = view.text;
  if (text?.kind !== 'words') return 'moved';
  const segments = (text.segments ?? []) as unknown as PageSegment[];
  const notes = (text.notes ?? []) as unknown as PageSegment[];
  const segment = find(ask.kind === 'note' ? notes : segments, ask.segment);
  if (!segment) return 'moved';
  const after = replaceInRuns(segment.text ?? [], noteLabels(notes), ask.at, ask.selected, words);
  if (typeof after === 'string') return after;
  return { before: segment.text ?? [], after, ...(text.version ? { version: text.version } : {}) };
}

function find(list: readonly PageSegment[], id: string): PageSegment | null {
  for (const segment of list) {
    if (segment.id === id) return segment;
    const inside = segment.children ? find(segment.children, id) : null;
    if (inside) return inside;
  }
  return null;
}

/** Only this site's own pages may send a fix as the person: another site cannot make their browser do it (the API checks the same for itself). */
export function fromThisSite(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export function answer(body: FixAnswer, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

/** The API's refusal, as the sheet tells it. */
export function failed(error: unknown): Response {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return answer({ ok: false, why: 'signin' }, 401);
  if (status === 403) return answer({ ok: false, why: 'refused' }, 403);
  if (status === 409) return answer({ ok: false, why: 'changed' }, 409);
  if (status === 429) return answer({ ok: false, why: 'busy' }, 429);
  if (status === 400 || status === 404) return answer({ ok: false, why: 'refused', ...messageOf(error) }, status);
  console.error('fix', error);
  return answer({ ok: false, why: 'down' }, 502);
}

const messageOf = (error: unknown) => {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? { message: message.slice(0, 200) } : {};
};
