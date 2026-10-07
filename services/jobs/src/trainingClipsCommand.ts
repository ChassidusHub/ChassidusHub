import { writeFile } from 'node:fs/promises';
import { summariseTraining, trainingClips } from '@chassidushub/core';
import { withCatalog, type Context } from './commands.js';

/**
 * `chassidushub training-clips`: the next Rebbe Whisper's training data, read
 * straight from the catalog (core/trainingClips.ts). Every transcript
 * paragraph of the Rebbe speaking that a person checked or fixed, the
 * fixes still waiting for review too, as clips in the training script's format,
 * one JSON object a line; the training run takes the file with its other
 * clips (`train.py --clips clips-site.jsonl …`). `--since` counts what is
 * new since the last round; without `--out` it only reports.
 */
export async function trainingClipsCommand(ctx: Context, input: { out?: string; since?: string; files?: string; carried?: boolean }): Promise<void> {
  if (input.since && Number.isNaN(Date.parse(input.since))) throw new Error('--since is a date, like 2026-09-29');
  await withCatalog(ctx, async (catalog) => {
    const all = await trainingClips(catalog, { filesBaseUrl: input.files, carried: input.carried });
    const s = summariseTraining(all, input.since);
    ctx.log(`${s.clips} clips, ${s.hours} hours from ${s.recordings} recordings (${s.gold} gold, ${s.silver} silver; ${s.review.checked} checked, ${s.review.edited} fixed in part, ${s.review.pending} waiting for review); train ${s.trainHours} h, test ${s.testHours} h`);
    if (s.newHours !== null) ctx.log(`${s.newHours} hours checked since ${input.since}`);
    for (const [reason, n] of Object.entries(s.skipped)) ctx.log(`left out, ${reason}: ${n}`);
    if (input.out) {
      await writeFile(input.out, all.clips.map((c) => JSON.stringify(c)).join('\n') + (all.clips.length ? '\n' : ''));
      ctx.log(`wrote ${input.out}`);
    }
  });
}
