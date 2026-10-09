import type { Advisor } from './advice.js';
import type { Catalog, MergeCheck, MergeClash } from './catalog.js';
import { ExportGate } from './gate.js';
import type { Json, Resolution } from './merge.js';

/**
 * The machine's help with a suggestion's clashes (the plan, section 9:
 * "advice, never a merge"). For each field the site and a suggestion both
 * changed, each its own way, a language model is asked which to keep, or
 * for one value that keeps both. Its answer is a proposal, labelled as a
 * machine's, that fills in the reviewer's choices on the review page: only
 * a person's Approve merges anything. Words whose rights keep them home
 * are never sent; their clashes are left for a person.
 */

/** The model's proposal for one clash, in Approve's terms: the site's version (`ours`), the suggestion's (`theirs`), or a value of its own. */
export interface ClashProposal {
  entityId: string;
  path: string;
  resolution: Resolution;
  /** One sentence saying why, for the reviewer. */
  why: string;
}

/** The longest value sent whole; a longer one is cut, and then the model may only choose a side. */
const MAX_VALUE = 1500;

const SYSTEM = [
  'You help reviewers of ChassidusHub, an open catalog of Chabad Torah and media (sichos, farbrengens, seforim, recordings, scans).',
  'A Suggestion changed a field of an item; since it was written, the site changed the same field another way. You propose how to settle it; a person decides.',
  'You see the field as it was (base), as the site has it now (site) and as the suggestion has it (suggestion).',
  'Keep the site when the suggestion only repeats an older version or loses a later fix; keep the suggestion when it is the later or fuller correction;',
  'answer "both" only when the two changes fix different things in the same text or list and one value can hold both, and then give that value exactly, in the same JSON type.',
  'Never invent facts about the Rebbe, dates or sources. Answer with one JSON object and nothing else:',
  '{"take": "site" | "suggestion" | "both", "value": <only with both>, "why": "<one short sentence>"}',
].join(' ');

function shown(value: Json | undefined): { text: string; cut: boolean } {
  if (value === undefined) return { text: '(none: the field is absent)', cut: false };
  const text = JSON.stringify(value);
  return text.length > MAX_VALUE ? { text: `${text.slice(0, MAX_VALUE)}…(cut short)`, cut: true } : { text, cut: false };
}

function nameOf(data: Json | undefined): string {
  const d = (data ?? {}) as { title?: { he?: string; en?: string }; name?: { he?: string; en?: string }; label?: { he?: string; en?: string } };
  const name = d.title ?? d.name ?? d.label;
  return [name?.he, name?.en].filter(Boolean).join(' / ');
}

/** What the model is asked about one clash. */
export function clashPrompt(clash: MergeClash): { prompt: string; cut: boolean } {
  const base = shown(clash.base);
  const site = shown(clash.ours);
  const suggestion = shown(clash.theirs);
  const name = nameOf(clash.theirs ?? clash.ours ?? clash.base);
  const lines = [
    `Item: ${clash.type} ${clash.entityId}${name ? ` "${name}"` : ''}`,
    `Field: ${clash.path || '(the whole item; "none" means deleted)'}`,
    `base: ${base.text}`,
    `site: ${site.text}`,
    `suggestion: ${suggestion.text}`,
  ];
  const cut = base.cut || site.cut || suggestion.cut || clash.path === '';
  if (cut) lines.push('Choose "site" or "suggestion" only: a value of your own cannot be given here.');
  return { prompt: lines.join('\n'), cut };
}

const sameKind = (a: unknown, b: unknown) => (Array.isArray(a) ? Array.isArray(b) : a === null ? b === null : typeof a === typeof b && !Array.isArray(b));

/** The model's answer read strictly: a side, or a value of the same kind as the field; anything else is no proposal. */
export function readClashAnswer(answer: string, clash: MergeClash, cut: boolean): ClashProposal | null {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: { take?: unknown; value?: unknown; why?: unknown };
  try {
    parsed = JSON.parse(answer.slice(start, end + 1)) as typeof parsed;
  } catch {
    return null;
  }
  const why = typeof parsed.why === 'string' ? parsed.why.trim().slice(0, 300) : '';
  const at = { entityId: clash.entityId, path: clash.path, why };
  if (parsed.take === 'site') return { ...at, resolution: { take: 'ours' } };
  if (parsed.take === 'suggestion') return { ...at, resolution: { take: 'theirs' } };
  if (parsed.take !== 'both' || cut || parsed.value === undefined) return null;
  const like = clash.theirs ?? clash.ours;
  if (like !== undefined && !sameKind(parsed.value, like)) return null;
  return { ...at, resolution: { value: parsed.value as Json } };
}

/**
 * Proposals for a suggestion's clashes that no decision settles yet, the
 * first `limit` of them, asked a few at a time. A clash the model could
 * not answer plainly, or whose words are withheld, gets none.
 */
export async function proposeClashResolutions(
  catalog: Catalog,
  advisor: Advisor,
  check: Pick<MergeCheck, 'clashes'>,
  options: { limit?: number; concurrency?: number } = {},
): Promise<{ proposals: ClashProposal[]; asked: number; left: number; model: string }> {
  const open = check.clashes.filter((c) => c.decided === null);
  const asked = open.slice(0, Math.max(1, Math.min(options.limit ?? 40, 100)));
  const gate = new ExportGate(catalog);
  const withheld = new Set<string>();
  for (const id of new Set(asked.map((c) => c.entityId))) {
    const clash = asked.find((c) => c.entityId === id)!;
    for (const data of [clash.ours, clash.theirs, clash.base]) {
      if (data === undefined || data === null || clash.path !== '') continue;
      if ((await gate.redact({ id: clash.entityId as never, type: clash.type, path: null, rev: 0, data })).withheld) withheld.add(id);
    }
    // A field's words are judged by the item they belong to, as the site has it.
    const item = await catalog.get(clash.entityId as never).catch(() => null);
    if (item && (await gate.redact(item)).withheld) withheld.add(id);
  }
  const proposals: ClashProposal[] = [];
  const queue = asked.filter((c) => !withheld.has(c.entityId));
  const workers = Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 8, queue.length)) }, async () => {
    for (let clash = queue.shift(); clash; clash = queue.shift()) {
      const { prompt, cut } = clashPrompt(clash);
      const answer = await advisor.complete(SYSTEM, prompt, { maxTokens: cut ? 200 : 1500 }).catch(() => '');
      const proposal = readClashAnswer(answer, clash, cut);
      if (proposal) proposals.push(proposal);
    }
  });
  await Promise.all(workers);
  const order = new Map(asked.map((c, i) => [`${c.entityId}${c.path}`, i]));
  proposals.sort((a, b) => order.get(`${a.entityId}${a.path}`)! - order.get(`${b.entityId}${b.path}`)!);
  return { proposals, asked: asked.length, left: open.length - asked.length, model: advisor.model };
}
