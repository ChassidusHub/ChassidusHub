import { describe, expect, it } from 'vitest';
import { answerFor } from '../app/offline/policy.js';
import { wordsAddress, wordsKey } from '../app/reader/words.server.js';

const site = 'https://new.chassidushub.org';
const ask = (path: string, extra: { method?: string; mode?: string } = {}) => answerFor({ method: 'GET', url: `${site}${path}`, ...extra }, site);

describe('what the service worker keeps', () => {
  it('keeps the built files and a sicha’s words for good', () => {
    expect(ask('/assets/entry.client-abc.js')).toBe('shell');
    expect(ask('/favicon.svg')).toBe('shell');
    expect(ask('/_/words/rh-aaaaaab1/0123456789abcdef0123')).toBe('words');
  });

  it('asks the network for pages and their click data, keeping the last copy', () => {
    expect(ask('/likkutei-sichos/12/3', { mode: 'navigate' })).toBe('page');
    expect(ask('/likkutei-sichos/12/3.data?_routes=routes%2Fitem')).toBe('page');
    expect(ask('/', { mode: 'navigate' })).toBe('page');
  });

  it('leaves alone what is one person’s, sent as them, or another site’s', () => {
    for (const path of ['/account', '/account.data', '/me/fixes', '/inbox', '/signin', '/back', '/_/fix', '/_/auth/session', '/sw.js']) {
      expect(ask(path, { mode: 'navigate' }), path).toBe('pass');
    }
    expect(ask('/likkutei-sichos/12/3?edit', { mode: 'navigate' })).toBe('pass');
    expect(ask('/likkutei-sichos/12/3', { mode: 'navigate', method: 'POST' })).toBe('pass');
    expect(answerFor({ method: 'GET', url: 'https://api.chassidushub.org/v1/view', mode: 'cors' }, site)).toBe('pass');
    // A path that only starts like a personal one is a page like any other.
    expect(ask('/newsletter', { mode: 'navigate' })).toBe('page');
  });
});

describe('a sicha’s words by their own key', () => {
  it('gives the same words the same key, and changed words another', async () => {
    const one = await wordsKey({ body: '<p>א</p>', notes: '' });
    expect(one).toMatch(/^[0-9a-f]{20}$/);
    expect(await wordsKey({ body: '<p>א</p>', notes: '' })).toBe(one);
    expect(await wordsKey({ body: '<p>ב</p>', notes: '' })).not.toBe(one);
    // A note moved into the body is other words, not the same ones.
    expect(await wordsKey({ body: '<p>א</p>\n', notes: '' })).not.toBe(await wordsKey({ body: '<p>א</p>', notes: '\n' }));
  });

  it('keeps the version asked for in the address', () => {
    expect(wordsAddress('rh-aaaaaab1', '0123456789abcdef0123')).toBe('/_/words/rh-aaaaaab1/0123456789abcdef0123');
    expect(wordsAddress('rh-aaaaaab1', '0123456789abcdef0123', 'en')).toBe('/_/words/rh-aaaaaab1/0123456789abcdef0123?language=en');
  });
});
