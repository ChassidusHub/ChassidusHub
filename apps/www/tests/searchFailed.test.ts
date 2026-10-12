import { describe, expect, it } from 'vitest';
import type { ChassidusHub } from '@chassidushub/client';
import { loader } from '../app/routes/search.js';

/** A search page's loader with an API whose search answers, or fails. */
async function searched(answers: boolean) {
  let failed = 0;
  const api = { searchPage: async () => (answers ? { query: 'x', date: null, within: null, top: null, works: [], events: [], words: [] } : Promise.reject(new Error('down'))) } as unknown as ChassidusHub;
  const data = loader({ request: new Request('https://new.chassidushub.org/search?q=x'), context: { api, failed: () => failed++ }, params: {} } as never);
  await data.page;
  return failed;
}

describe('a search that did not answer', () => {
  it('tells the edge to forget its page, and one that answered does not (#342)', async () => {
    expect(await searched(false)).toBe(1);
    expect(await searched(true)).toBe(0);
  });
});
