import { findSegment, inlineText, isPageText, plainInline, type EntityId, type PageInline, type PageText } from '@chassidushub/model';
import type { Catalog, ChangesetRow } from './catalog.js';
import { invalid, notFound } from './errors.js';
import type { Json } from './merge.js';
import { applyWords } from './pageWords.js';
import { LIVE_FIX_WORDS } from './permissions.js';
import { fixParagraph } from './sync.js';
import { fixLine } from './text.js';
import { matchWords, words } from './words.js';

/**
 * One fix for every kind of text (RFC 0001): a sefer's own words (a body
 * segment), a paragraph of a transcript or hanacha, a line on a scan's
 * page. The person selects words, types, and sends; a small fix goes live
 * at once after the AI check, else it is a suggestion as it always was.
 * Each kind is changed by its own function (applyWords, fixParagraph,
 * fixLine), so a fix has the same history, diff and revert as any other.
 */

/** The AI check: true when the change looks like a typo or misreading fixed, false when not, null when it could not say. */
export type FixJudge = (change: { before: string; after: string }) => Promise<boolean | null>;

export interface FixInput {
  /** The page the words are on: a unit (or any item with a body), a recording (its transcript), or a scan. */
  item: EntityId;
  /** A body's version (`he`, `en`); its first when not given. */
  version?: string;
  /** A body segment's id, a transcript paragraph's id, or `page:line` on a scan. */
  segment: string;
  /** The words as the person saw them, so a change made since is never overwritten. */
  before: string | PageInline[];
  after: string | PageInline[];
}

export interface FixResult {
  changeset: ChangesetRow;
  live: boolean;
  /** Why it waits for a reviewer, when it does. */
  reason: string | null;
}

/** How long the AI check may take before the fix simply waits for a reviewer. */
export const FIX_CHECK_MS = 3_000;

const plain = (value: string | PageInline[]) => (typeof value === 'string' ? value : inlineText(value)).replace(/\s+/g, ' ').trim();

/** How many words differ between two texts: the larger of the words taken out and the words put in. */
export function wordsChanged(before: string, after: string): number {
  const a = words(before).map((w) => w.key);
  const b = words(after).map((w) => w.key);
  const same = matchWords(a, b).length;
  return Math.max(a.length - same, b.length - same);
}

export async function sendFix(catalog: Catalog, by: string, input: FixInput, options: { judge: FixJudge | null; liveFixes: boolean }): Promise<FixResult> {
  const item = await catalog.get(input.item);
  if (!item) throw notFound(`item ${input.item}`);
  const before = plain(input.before);
  const after = plain(input.after);
  if (!after) throw invalid('give the words as they should be');
  const changed = wordsChanged(before, after);
  if (changed === 0) throw invalid('the words are the same as they are now');

  // Small, switched on, and the AI check says yes: sent to go live. Anything else is a suggestion, with why.
  let reason: string | null = null;
  if (!options.liveFixes) reason = 'fixes are reviewed first for now';
  else if (changed > LIVE_FIX_WORDS) reason = `more than ${LIVE_FIX_WORDS} words changed; a reviewer looks first`;
  else if (!options.judge) reason = 'the automatic check is not set up; a reviewer looks first';
  else {
    const verdict = await withTimeout(options.judge({ before, after }), FIX_CHECK_MS).catch(() => null);
    if (verdict !== true) reason = verdict === false ? 'the automatic check asked for a reviewer to look' : 'the automatic check did not answer; a reviewer looks first';
  }
  let result = null as FixResult | null;
  const send = async (suggestion: number): Promise<ChangesetRow> => {
    if (reason !== null) {
      const changeset = await catalog.submit(suggestion, by);
      result = { changeset, live: changeset.status === 'merged', reason: changeset.status === 'merged' ? null : reason };
      return changeset;
    }
    result = await catalog.submitFix(suggestion, by);
    return result.changeset;
  };

  if (item.type === 'scan') {
    const [page, line] = input.segment.split(':');
    if (!page || !line || !/^\d+$/.test(page)) throw invalid('on a scan, the segment is page:line');
    await fixLine(catalog, by, { scan: item.id, page: Number(page), line, text: after, before }, { send });
  } else if (item.type === 'recording') {
    const segment = await catalog.get(input.segment as EntityId);
    const text = segment?.type === 'segment' ? await catalog.get((segment.data as { text?: EntityId }).text as EntityId) : null;
    if (!segment || (text?.data as { recording?: string } | undefined)?.recording !== item.id) throw notFound('no such paragraph in this transcript');
    await fixParagraph(catalog, by, { segment: segment.id, content: after, complete: false, before }, { send });
  } else {
    const data = item.data as Record<string, unknown>;
    const version = input.version ?? (isPageText(data.body) ? data.body.versions[0]?.id : undefined);
    const runs = (value: string | PageInline[]) => (typeof value === 'string' ? plainInline(value) : value);
    const next = applyWords(data, { change: 'edit', version, segment: input.segment, text: runs(input.after), before: runs(input.before) });
    // Fixing is not checking: a machine's words a person fixed are marked edited, and stay unchecked until someone checks them.
    const old = isPageText(data.body) ? data.body.versions.find((v) => v.id === version) : undefined;
    const origin = old ? findSegment(old, input.segment)?.segment.origin : undefined;
    if (origin && !origin.checked) {
      const body = next.body as PageText;
      const found = findSegment(body.versions.find((v) => v.id === version)!, input.segment);
      if (found) found.segment.origin = { ...origin, edited: true };
    }
    const suggestion = await catalog.createChangeset(by, { title: 'A fix to the words' });
    await catalog.putRevision(suggestion.id, by, { id: item.id, type: item.type, data: next as unknown as Json });
    await send(suggestion.id);
  }
  return result!;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([promise, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]).finally(() => clearTimeout(timer));
}
