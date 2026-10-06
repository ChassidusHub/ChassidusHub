import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db.js';
import type { RevalidatingFetcher } from '../src/sync.js';
import { syncAll } from '../src/sync.js';
import { PRE_NESIUS_BUCKET_PATH, REAL_STANDALONE_YEARS } from '../src/crawl.js';

const BASE_URL = 'https://www.mafteiach.app';

function listingJs(entries: Array<{ id: number; date: string; label: string }>): string {
  const buttons = entries
    .map(
      (e) => `
        <div id="farbrengen_${e.id}" class="farbrengen">
          <button id="farbrengen_${e.id}_button" class="farbrengen-button button" onclick="loadFarbrengenFragment(event, ${e.id}, false, '${e.date}')">
            <div>${e.label}</div>
          </button>
        </div>`,
    )
    .join('');
  const html = `<main>${buttons}</main>`;
  return `(() => {\n  let html = ${JSON.stringify(html)}\n  window.setOuterHTMLWithScripts\n})()`;
}

function fragmentJs(text: string): string {
  const html = `<div><button class="farbrengen-detail-button tochen_inyonim-button has-content button">x</button><div class="farbrengen-detail-content tochen_inyonim-content hidden"><div class="trix-content">${text}</div></div></div>`;
  return `(() => {\n  let html = ${JSON.stringify(html)}\n  window.setOuterHTMLWithScripts\n})()`;
}

/** A fake "live site" for testing sync logic without any network access - state is mutable so a test can simulate the site changing between two sync() calls. */
class FakeSite implements RevalidatingFetcher {
  listings = new Map<string, Array<{ id: number; date: string; label: string }>>();
  fragments = new Map<number, { text: string; version: number }>();
  private clientEtags = new Map<string, string>();

  async fetchWithRevalidation(url: string) {
    const listingMatch = /\/all\/by_year\/([\w_]+)\.js/.exec(url);
    const fragmentMatch = /\/all\/(\d+)\/fragment\.js/.exec(url);

    let body: string;
    let etag: string;
    if (listingMatch) {
      const key = listingMatch[1]!;
      body = listingJs(this.listings.get(key) ?? []);
      etag = `W/"listing-${key}-${body.length}"`;
    } else if (fragmentMatch) {
      const id = Number(fragmentMatch[1]);
      const fragment = this.fragments.get(id);
      if (!fragment) throw new Error(`no fragment for ${id}`);
      body = fragmentJs(fragment.text);
      etag = `W/"fragment-${id}-v${fragment.version}"`;
    } else {
      throw new Error(`unexpected URL in test: ${url}`);
    }

    const changed = this.clientEtags.get(url) !== etag;
    this.clientEtags.set(url, etag);
    return { body, etag, changed };
  }
}

function allStandaloneYearKeys(): string[] {
  const keys = [PRE_NESIUS_BUCKET_PATH.replace('/all/by_year/', '')];
  for (let y = REAL_STANDALONE_YEARS.from; y <= REAL_STANDALONE_YEARS.to; y++) keys.push(String(y));
  return keys;
}

describe('syncAll', () => {
  let db: DatabaseSync;
  let site: FakeSite;

  beforeEach(() => {
    db = openDatabase(':memory:');
    site = new FakeSite();
    for (const key of allStandaloneYearKeys()) site.listings.set(key, []);
  });

  it('inserts every occasion on the first sync of an empty DB', async () => {
    site.listings.set('5711', [{ id: 1, date: '5711-02-10', label: 'Test' }]);
    site.fragments.set(1, { text: 'v1', version: 1 });

    const result = await syncAll({ db, fetcher: site });
    expect(result.inserted).toBe(1);
    expect(result.newIds).toEqual([1]);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
  });

  it('a second sync with nothing changed on the site reports everything unchanged', async () => {
    site.listings.set('5711', [{ id: 1, date: '5711-02-10', label: 'Test' }]);
    site.fragments.set(1, { text: 'v1', version: 1 });
    await syncAll({ db, fetcher: site });

    const result = await syncAll({ db, fetcher: site });
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(1);
    expect(result.newIds).toEqual([]);
    expect(result.missingIds).toEqual([]);
  });

  it('detects a brand-new occasion added to the live listing since the last sync', async () => {
    site.listings.set('5711', [{ id: 1, date: '5711-02-10', label: 'Test' }]);
    site.fragments.set(1, { text: 'v1', version: 1 });
    await syncAll({ db, fetcher: site });

    site.listings.set('5711', [
      { id: 1, date: '5711-02-10', label: 'Test' },
      { id: 2, date: '5711-02-17', label: 'New one' },
    ]);
    site.fragments.set(2, { text: 'v1', version: 1 });

    const result = await syncAll({ db, fetcher: site });
    expect(result.newIds).toEqual([2]);
    expect(result.inserted).toBe(1);
    expect(result.unchanged).toBe(1); // id 1 still unchanged
  });

  it('detects an occasion edited on the site (new etag/body) as "updated", not "unchanged"', async () => {
    site.listings.set('5711', [{ id: 1, date: '5711-02-10', label: 'Test' }]);
    site.fragments.set(1, { text: 'v1', version: 1 });
    await syncAll({ db, fetcher: site });

    site.fragments.set(1, { text: 'v2 - corrected', version: 2 });
    const result = await syncAll({ db, fetcher: site });
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(0);

    const row = db.prepare('SELECT tochen_inyanim_text FROM occasions WHERE id = ?').get(1) as { tochen_inyanim_text: string };
    expect(row.tochen_inyanim_text).toBe('v2 - corrected');
  });

  it('reports (without deleting) an occasion delisted from the live site', async () => {
    site.listings.set('5711', [{ id: 1, date: '5711-02-10', label: 'Test' }]);
    site.fragments.set(1, { text: 'v1', version: 1 });
    await syncAll({ db, fetcher: site });

    site.listings.set('5711', []); // delisted
    const result = await syncAll({ db, fetcher: site });
    expect(result.missingIds).toEqual([1]);
    expect(db.prepare('SELECT COUNT(*) as n FROM occasions').get()).toEqual({ n: 1 }); // still in the DB
  });
});
