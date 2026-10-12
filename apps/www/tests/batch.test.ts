import { describe, expect, it } from 'vitest';
import { gapWords, isBatch, placeIn, queueOf, tally, type TreeGroup } from '../app/back/batch.js';

/** The back room's catalog queue (back/batch.ts): which suggestions are batches, their order, and the tree in words. */
describe('the catalog queue', () => {
  const listed = [
    { id: 3, number: 12, title: 'ג', status: 'open', author: 'u', types: ['work', 'unit'], submittedAt: '2026-10-12T03:00:00Z' },
    { id: 2, number: 11, title: 'ב', status: 'open', author: 'u', types: ['segment'] },
    { id: 1, number: 10, title: 'א', status: 'sent_back', author: 'u', types: ['set'] },
    { id: 0, number: 9, title: 'ת', status: 'open', author: 'u', types: ['unit'] },
  ];

  it('holds the open suggestions that change the tree, oldest first', () => {
    expect(isBatch(['segment', 'text'])).toBe(false);
    expect(isBatch(['set'])).toBe(true);
    expect(queueOf(listed).map((row) => row.id)).toEqual([0, 3]);
  });

  it('knows the batches before and after this one', () => {
    const queue = queueOf(listed);
    expect(placeIn(queue, 0)).toMatchObject({ at: 0, of: 2, previous: null, next: { id: 3 } });
    expect(placeIn(queue, 99)).toMatchObject({ at: -1, next: { id: 0 } });
  });

  it('says folded rows and a group’s changes in words', () => {
    expect(gapWords({ gap: 40 })).toBe('ועוד 40');
    expect(gapWords({ gap: 25, mark: 'in' })).toBe('ועוד 25 נכנסים');
    const row = (mark: 'same' | 'in' | 'out' | 'renamed') => ({ id: `rh-${mark}`, type: 'unit', name: mark, path: null, mark });
    const group: TreeGroup = {
      parent: { id: 'rh-p', type: 'work', name: 'p', path: null, isNew: false, gone: false },
      before: [row('same'), row('out'), row('renamed')],
      after: [row('same'), row('renamed'), row('in'), { gap: 5, mark: 'in' }],
      counts: { before: 3, after: 8 },
      changes: 8,
    };
    expect(tally(group)).toBe('1 יוצא · 1 שם חדש · 6 נכנסים');
  });
});
