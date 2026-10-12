import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { wordsAddress, wordsKey } from '../app/reader/words.server.js';

/** The service worker's texts section, read from public/sw.js as the browser runs it. */
const worker: Record<string, unknown> = { self: { addEventListener() {}, location: { origin: 'https://new.chassidushub.org' } }, URL };
runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), worker);
const textsAnswer = worker.textsAnswer as (request: { mode?: string }, url: URL) => string | null;
const ask = (path: string, mode = 'navigate') => textsAnswer({ mode }, new URL(path, 'https://new.chassidushub.org'));

describe('what the service worker keeps of what is read', () => {
  it('keeps a sicha’s words, and the last copy of each page and its click data', () => {
    expect(ask('/_/words/rh-aaaaaab1/0123456789abcdef0123', 'cors')).toBe('words');
    expect(ask('/likkutei-sichos/12/3')).toBe('page');
    expect(ask('/likkutei-sichos/12/3.data?_routes=routes%2Fitem', 'cors')).toBe('page');
  });

  it('never keeps what is one person’s, sent as them, Edit, or a search', () => {
    for (const path of ['/account', '/account.data', '/me/fixes', '/inbox', '/signin', '/back', '/_/fix', '/_/auth/session', '/sw.js', '/likkutei-sichos/12/3?edit', '/search?q=שמיני', '/search.data?q=שמיני']) {
      expect(ask(path), path).toBe(null);
    }
    // A path that only starts like a personal one is a page like any other.
    expect(ask('/newsletter')).toBe('page');
  });
});

describe('a sicha’s words by their own key', () => {
  it('gives the same words the same key, and changed words another', async () => {
    const one = await wordsKey({ body: '<p>א</p>', notes: '' });
    expect(one).toMatch(/^[0-9a-f]{20}$/);
    expect(await wordsKey({ body: '<p>א</p>', notes: '' })).toBe(one);
    expect(await wordsKey({ body: '<p>ב</p>', notes: '' })).not.toBe(one);
    // Words moved from the body to the notes are other words, not the same ones.
    expect(await wordsKey({ body: '<p>א</p>\n', notes: '' })).not.toBe(await wordsKey({ body: '<p>א</p>', notes: '\n' }));
  });

  it('keeps the version asked for in the address', () => {
    expect(wordsAddress('rh-aaaaaab1', '0123456789abcdef0123')).toBe('/_/words/rh-aaaaaab1/0123456789abcdef0123');
    expect(wordsAddress('rh-aaaaaab1', '0123456789abcdef0123', 'en')).toBe('/_/words/rh-aaaaaab1/0123456789abcdef0123?language=en');
  });
});
