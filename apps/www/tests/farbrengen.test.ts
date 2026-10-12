import { describe, expect, it } from 'vitest';
import type { ItemView } from '@chassidushub/client';
import { farbrengenMachine, farbrengenOf, farbrengenViews, farbrengenWords, MOST_SICHOS } from '../app/reader/farbrengen.server.js';

const he = (text: string) => ({ he: text });
const sicha = (id: string, n: number, machine = 'all', note = false) =>
  ({
    item: {
      id,
      type: 'unit',
      path: `/sichos-kodesh/5720/5720-01-02/${n}`,
      data: { label: he(`יום ב' דר"ה, שיחה ${n}`), position: [{ level: 'year', label: he('ה\'תש"כ') }, { level: 'farbrengen', label: he('יום ב\' דר"ה') }, { level: 'sicha', label: he(`שיחה ${n}`) }] },
    },
    pathBar: [{ kind: 'unit', chosen: { name: he(`שיחה ${n}`), path: `/sichos-kodesh/5720/5720-01-02/${n}` }, choices: [1, 2].map((k) => ({ name: he(`שיחה ${k}`), path: `/sichos-kodesh/5720/5720-01-02/${k}` })) }],
    text: {
      kind: 'words',
      machine,
      version: 'v1',
      segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: `מילים ${n}` }, ...(note ? [{ note: 'n1' }] : [])] }],
      notes: note ? [{ id: 'n1', kind: 'note', n: 1, text: [{ text: `הערה ${n}` }] }] : [],
    },
  }) as unknown as ItemView;

describe('a farbrengen read as one page', () => {
  it('is known by its farbrengen level, with its sichos in order', () => {
    expect(farbrengenOf(sicha('rh-a', 1))).toEqual({ label: 'יום ב\' דר"ה', sichos: [{ path: '/sichos-kodesh/5720/5720-01-02/1' }, { path: '/sichos-kodesh/5720/5720-01-02/2' }] });
    const alone = sicha('rh-a', 1);
    (alone.item.data as { position: { level: string }[] }).position[1]!.level = 'volume';
    expect(farbrengenOf(alone)).toBeNull();
  });

  it('draws every sicha under its own name, each its own item for fixing, and keeps two sichos’ notes apart', () => {
    const words = farbrengenWords([sicha('rh-a', 1, 'all', true), sicha('rh-b', 2, 'all', true)], 'יום ב\' דר"ה')!;
    expect(words.body).toContain('<section class="fsicha" id="u-rh-a" data-fix-item="rh-a" data-fix-version="v1"><h2 class="fh">שיחה 1</h2>');
    expect(words.body).toContain('id="u-rh-b" data-fix-item="rh-b"');
    expect(words.body.indexOf('מילים 1')).toBeLessThan(words.body.indexOf('מילים 2'));
    expect(words.body).toContain('href="#n-0-n1"');
    expect(words.body).toContain('href="#n-1-n1"');
    expect(words.notes).toContain('id="n-0-n1"');
    expect(words.notes).toContain('id="n-1-n1"');
  });

  it('says the words are a machine’s when all, some or none of the sichos are', () => {
    expect(farbrengenMachine([sicha('rh-a', 1), sicha('rh-b', 2)])).toBe('all');
    expect(farbrengenMachine([sicha('rh-a', 1), sicha('rh-b', 2, 'none')])).toBe('some');
    expect(farbrengenMachine([sicha('rh-a', 1, 'none'), sicha('rh-b', 2, 'none')])).toBe('none');
  });

  it('is read a sicha at a time when it has more sichos than one page reads', () => {
    const long = sicha('rh-a', 1);
    const choices = Array.from({ length: MOST_SICHOS + 1 }, (_, k) => ({ name: he(`שיחה ${k + 1}`), path: `/sichos-kodesh/5720/5720-01-02/${k + 1}` }));
    (long.pathBar[0] as unknown as { choices: unknown[] }).choices = choices;
    expect(farbrengenOf(long)).toBeNull();
  });

  it('is the sicha\u2019s own page when any other sicha cannot be read, never one with a sicha missing', async () => {
    const own = sicha('rh-a', 1);
    const sichos = farbrengenOf(own)!.sichos;
    const failing = { itemView: async () => Promise.reject(Object.assign(new Error('down'), { status: 503 })) } as never;
    expect(await farbrengenViews(own, sichos, failing)).toBeNull();
    const working = { itemView: async () => sicha('rh-b', 2) } as never;
    expect((await farbrengenViews(own, sichos, working))?.map((v) => v.item.id)).toEqual(['rh-a', 'rh-b']);
  });
});
