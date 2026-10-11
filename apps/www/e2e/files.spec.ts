import { expect, test } from '@playwright/test';

// Files for crawlers, agents and browsers. Only chassidushub.org itself is indexed; every other address (the beta, this test server) is hidden.

test('robots.txt keeps this address out of search engines', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Disallow: /\n');
});

test('security.txt names where to report a problem', async ({ request }) => {
  const text = await (await request.get('/.well-known/security.txt')).text();
  expect(text).toContain('Contact: https://github.com/ChassidusHub/ChassidusHub/security/advisories/new');
  expect(text).toMatch(/Expires: \d{4}-\d\d-\d\dT00:00:00\.000Z/);
});

test('the browser can search the catalog from its address bar', async ({ page, request }) => {
  await page.goto('/about');
  await expect(page.locator('link[rel="search"]')).toHaveAttribute('href', '/opensearch.xml');
  expect(await (await request.get('/opensearch.xml')).text()).toContain('/search?q={searchTerms}');
});

test('llms.txt says what ChassidusHub is and where the API is', async ({ request }) => {
  const text = await (await request.get('/llms.txt')).text();
  expect(text).toMatch(/^# ChassidusHub/);
  expect(text).toContain('https://api.chassidushub.org/mcp');
});

test.describe('from the stand-in API', () => {
  test.skip(!!process.env.BASE_URL, 'the sample sitemaps and routes exist only in the stand-in API');

  test('the sitemaps list the site’s pages and every item', async ({ request }) => {
    const index = await (await request.get('/sitemap.xml')).text();
    expect(index).toContain('/sitemaps/pages.xml');
    expect(index).toContain('/sitemaps/unit-1.xml');
    const units = await (await request.get('/sitemaps/unit-1.xml')).text();
    expect(units).toContain('/sample/1/1</loc><lastmod>2026-10-10T00:00:00Z</lastmod>');
    expect(units).toContain('/rh-aaaaaab2</loc>');
    expect((await request.get('/sitemaps/unit.xml', { maxRedirects: 0 })).headers().location).toBe('/sitemaps/unit-1.xml');
    expect((await request.get('/sitemaps/nothing-1.xml')).status()).toBe(404);
  });

  test('llms-full.txt adds every route of the API', async ({ request }) => {
    expect(await (await request.get('/llms-full.txt')).text()).toContain('- `GET /v1/search` search: Search the catalog');
  });
});
