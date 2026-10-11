import { describe, expect, it } from 'vitest';
import { dropAt, groupsOf, pick, planOf, said, slugOf, step, type TreeNode } from '../app/stewards/organize.js';
import { bucketShowcases, mediaAddress, mediaSourceOf, newToken, TOKEN, type Showcase } from '../app/stewards/showcase.js';
import { hebrewOf } from '../app/stewards/call.js';

const node = (id: string, type = 'set', counts = {}): TreeNode => ({ id, type, path: `/sets/${id}`, name: { he: `שם ${id}` }, counts });

describe('organizing: the rows, their order and the plan', () => {
  it('groups a set into its sets, its sefarim and the rest; a sefer into its units; the top into sets', () => {
    const children = [node('a'), node('b', 'work'), node('c', 'unit'), node('d')];
    expect(groupsOf(node('root'), children).map((g) => [g.key, g.nodes.map((n) => n.id), g.orderable])).toEqual([
      ['sets', ['a', 'd'], true],
      ['works', ['b'], true],
      ['others', ['c'], false],
    ]);
    expect(groupsOf(node('w', 'work'), [node('u', 'unit')])[0]!.key).toBe('units');
    expect(groupsOf(null, children)[0]!.nodes.map((n) => n.id)).toEqual(['a', 'd']);
  });

  it('picks one row, or with shift every row from the last one pressed', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect([...pick(order, new Set(), 'b', false, null)]).toEqual(['b']);
    expect([...pick(order, new Set(['b']), 'd', true, 'b')].sort()).toEqual(['b', 'c', 'd']);
    expect([...pick(order, new Set(['b', 'c', 'd']), 'c', true, 'd')]).toEqual(['b']);
  });

  it('moves picked rows a place together, and not past the ends', () => {
    expect(step(['a', 'b', 'c', 'd'], ['b', 'c'], -1)).toEqual(['b', 'c', 'a', 'd']);
    expect(step(['a', 'b', 'c', 'd'], ['b', 'd'], 1)).toEqual(['a', 'b', 'c', 'd']);
    expect(step(['a', 'b', 'c'], ['a'], 1)).toEqual(['b', 'a', 'c']);
  });

  it('drops dragged rows before another, or at the end', () => {
    expect(dropAt(['a', 'b', 'c', 'd'], ['d'], 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(dropAt(['a', 'b', 'c', 'd'], ['a', 'c'], null)).toEqual(['b', 'd', 'a', 'c']);
    expect(dropAt(['a', 'b'], ['a'], 'a')).toEqual(['a', 'b']);
  });

  it('makes the plan: the steps, then a reorder of each list changed, leaving out what was moved away', () => {
    const groups = groupsOf(node('root'), [node('a'), node('b'), node('c')]);
    const steps = [{ op: 'move' as const, items: ['c'], to: 'x', from: 'root' }];
    expect(planOf(steps, groups, { sets: ['b', 'a', 'c'] })).toEqual([...steps, { op: 'reorder', items: ['b', 'a'], parent: 'root' }]);
    expect(planOf([], groups, { sets: ['a', 'b', 'c'] })).toEqual([]);
  });

  it('says each step in Hebrew', () => {
    const name = (id: string) => `«${id}»`;
    expect(said({ op: 'move', items: ['a'], to: 'b' }, name)).toBe('העברת «a» אל «b» (גם)');
    expect(said({ op: 'move', items: ['a', 'c'], to: null, from: 'b' }, name)).toBe('הוצאת 2 פריטים מ«b»');
    expect(said({ op: 'merge', from: 'a', into: 'b' }, name)).toBe('מיזוג «a» אל «b»');
  });

  it('makes an address from Latin letters', () => {
    expect(slugOf("Sefer HaMa'amarim 5711")).toBe('sefer-hamaamarim-5711');
    expect(slugOf('  --Éé--  ')).toBe('ee');
  });
});

describe('showcases', () => {
  it('makes tokens nobody guesses, in the shape the old links have', () => {
    const token = newToken();
    expect(TOKEN.test(token)).toBe(true);
    expect(newToken()).not.toBe(token);
  });

  it('knows where a file is, and sends a guest only through the API for what the catalog links', () => {
    const drive = mediaSourceOf('https://drive.google.com/file/d/abcdefghijk12/view?resourcekey=0-x');
    expect(drive).toEqual({ kind: 'drive', id: 'abcdefghijk12', resourceKey: '0-x' });
    expect(mediaAddress(drive!, 'https://api.example', false)).toBe('https://api.example/v1/drive/abcdefghijk12');
    expect(mediaAddress(drive!, 'https://api.example', true)).toBe('https://drive.google.com/file/d/abcdefghijk12/view?resourcekey=0-x');
    expect(mediaSourceOf(`https://api.chassidushub.org/objects/${'a'.repeat(64)}`)).toEqual({ kind: 'object', sha256: 'a'.repeat(64) });
    expect(mediaSourceOf('https://example.org/file.mp3')).toBeNull();
  });

  it('reads and writes the same files in the bucket the old site wrote', async () => {
    const files = new Map<string, string>();
    const store = bucketShowcases({
      get: async (key) => (files.has(key) ? { text: async () => files.get(key)! } : null),
      put: async (key, value) => void files.set(key, value),
      delete: async (key) => void files.delete(key),
      list: async ({ prefix }) => ({ objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    });
    const showcase = { token: 'abcdefghijklmnopqrst', title: 't', note: '', created: '2026-10-01', updated: '2026-10-01' } as Showcase;
    await store.put(showcase);
    expect([...files.keys()]).toEqual(['showcases/abcdefghijklmnopqrst.json']);
    expect((await store.get('abcdefghijklmnopqrst'))?.title).toBe('t');
    expect(await store.get('../../secret')).toBeNull();
    expect((await store.list()).length).toBe(1);
    await store.remove(showcase.token);
    expect(await store.get(showcase.token)).toBeNull();
  });
});

describe('what the API refuses, in Hebrew', () => {
  it('says known refusals plainly, and the rest after a lead', () => {
    expect(hebrewOf('only stewards see this', 403)).toBe('רק שומרי האתר יכולים לעשות את זה.');
    expect(hebrewOf('anything', 502)).toBe('אין חיבור לאתר כרגע. נסו שוב בעוד רגע.');
    expect(hebrewOf('a set cannot hold itself', 400)).toBe('הבקשה לא עברה: a set cannot hold itself');
  });
});
