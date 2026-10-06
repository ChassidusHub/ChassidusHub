import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenEventTree } from '../src/flatten.js';
import type { CcdbEvent } from '../src/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const event1: CcdbEvent = JSON.parse(readFileSync(path.join(fixturesDir, 'ccdb-event-1.json'), 'utf8')).data;

describe('flattenEventTree', () => {
  it('produces one node per tree node: the root plus every sub-event (real fixture: 1 root + 4 sub-events)', () => {
    const { nodes } = flattenEventTree(event1);
    expect(nodes).toHaveLength(5);
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('marks the root as NOT having its own audio (its audio_recordings field is just the rolled-up aggregate of its children)', () => {
    const { nodes } = flattenEventTree(event1);
    const root = nodes.find((n) => n.id === 1)!;
    expect(root.hasOwnAudio).toBe(false);
  });

  it('marks each leaf sub-event as having its own audio', () => {
    const { nodes } = flattenEventTree(event1);
    for (const leafId of [2, 3, 4, 5]) {
      expect(nodes.find((n) => n.id === leafId)!.hasOwnAudio).toBe(true);
    }
  });

  it('deduplicates recordings that appear at both the parent rollup and the leaf (real fixture: 4 recordings, not 8)', () => {
    const { recordings } = flattenEventTree(event1);
    expect(recordings).toHaveLength(4);
    expect(recordings.map((r) => r.eventId).sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    for (const r of recordings) {
      expect(r.url).toMatch(/^https:\/\/dtgj2yu3gmlic\.cloudfront\.net\//);
      expect(r.durationMs).toBeGreaterThan(0);
    }
  });

  it('carries the real Hebrew/secular date fields through on every node', () => {
    const { nodes } = flattenEventTree(event1);
    const root = nodes.find((n) => n.id === 1)!;
    expect(root.dates).toEqual([
      {
        secular_year: 1951,
        secular_month: 1,
        secular_day: 17,
        hebrew_year: 5711,
        hebrew_month: 5,
        hebrew_day: 10,
        hebrew_month_name: 'Shevat',
        after_nightfall: false,
      },
    ]);
  });

  it('handles an event with no sub_events and no audio_recordings without error', () => {
    const bare: CcdbEvent = { id: 999, name: 'Bare', type: 'Farbrengen', description: '', has_long_description: false, parent_id: null, dates: [] };
    const { nodes, recordings } = flattenEventTree(bare);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.hasOwnAudio).toBe(false);
    expect(recordings).toEqual([]);
  });
});
