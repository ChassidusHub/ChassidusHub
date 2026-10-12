import { describe, expect, it } from 'vitest';
import { add, freshCatalog, yudShvat } from '../../../packages/core/tests/helpers.js';
import { forgetChangedPages, TODAYS_PAGES, warmTodaysPages, type Kept, type SitePages } from '../src/sitePages.js';

/** The kept mark in memory. */
function memory(): Kept & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return { values, get: async <T,>(name: string) => (values.get(name) as T) ?? null, put: async (name, value) => void values.set(name, value) };
}

/** A site that notes what it was told to forget, and answers `ok`. */
function site(ok = true): SitePages & { told: string[][] } {
  const told: string[][] = [];
  return { told, forget: async (ids) => (told.push([...ids].sort()), { ok, purges: 1, errors: ok ? [] : ['971 rate limited'] }) };
}

describe("forgetting the new site's pages about what merged", () => {
  it('forgets each merge once it has settled, with what it points at, and only once', async () => {
    const { catalog, set } = await freshCatalog();
    const kept = memory();
    const pages = site();

    // The first run notes where main is; there is nothing kept from before it.
    const first = await forgetChangedPages(catalog, kept, pages);
    expect(first.items).toBe(0);
    expect(pages.told).toEqual([]);

    const event = await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    // Too new: Hyperdrive may still answer from before it.
    expect(await forgetChangedPages(catalog, kept, pages)).toMatchObject({ through: first.through, items: 0 });
    expect(pages.told).toEqual([]);

    await catalog.db.query("UPDATE commit SET at = at - interval '5 minutes'");
    const second = await forgetChangedPages(catalog, kept, pages);
    expect(second.through).toBeGreaterThan(first.through);
    // The farbrengen, and the set it joined, whose page lists it.
    expect(pages.told).toEqual([[event, set].sort()]);

    expect(await forgetChangedPages(catalog, kept, pages)).toMatchObject({ items: 0 });
    expect(pages.told).toHaveLength(1);
  });

  it('keeps its mark when the site could not forget, so the next run tries again', async () => {
    const { catalog, set } = await freshCatalog();
    const kept = memory();
    await forgetChangedPages(catalog, kept, site());
    await add(catalog, 'mendy', 'keeper', 'event', yudShvat(set));
    await catalog.db.query("UPDATE commit SET at = at - interval '5 minutes'");
    const before = kept.values.get('site-pages');
    await expect(forgetChangedPages(catalog, kept, site(false))).rejects.toThrow(/rate limited/);
    expect(kept.values.get('site-pages')).toEqual(before);
    const again = site();
    await forgetChangedPages(catalog, kept, again);
    expect(again.told).toHaveLength(1);
  });
});

describe("drawing today's pages just after midnight", () => {
  it('draws Home and Listen at 00:01 UTC as a reader would, and at no other minute', async () => {
    const asked: string[] = [];
    const site = { fetch: async (request: Request) => (asked.push(new URL(request.url).pathname), new Response('page')) };
    expect(await warmTodaysPages(site, new Date('2026-10-13T00:00:30Z'))).toBe(0);
    expect(await warmTodaysPages(site, new Date('2026-10-13T12:01:00Z'))).toBe(0);
    expect(asked).toEqual([]);
    expect(await warmTodaysPages(site, new Date('2026-10-13T00:01:10Z'))).toBe(TODAYS_PAGES.length);
    expect(asked.sort()).toEqual(['/', '/listen']);
    // A site with no way to draw pages: nothing to do.
    expect(await warmTodaysPages({}, new Date('2026-10-13T00:01:10Z'))).toBe(0);
  });
});
