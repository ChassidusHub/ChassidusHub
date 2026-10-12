import { expect, test } from '@playwright/test';

/**
 * Catalog clicks drawn in the browser from the catalog snapshot it keeps
 * (app/catalog/browser.ts), with the stand-in API's sample snapshot
 * (fixture-snapshot.ts): once the page has read the snapshot behind it, a
 * click to a Rebbe, a sefer, a volume or a year of listening asks the server
 * for nothing (no `.data` request), as in the reader app.
 */
test.skip(!!process.env.BASE_URL, 'the sample catalog is only on the local build');

/** The page's requests for a page's data from the server, from now on. */
function serverReads(page: import('@playwright/test').Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('.data')) asked.push(request.url());
  });
  return asked;
}

test('the library is clicked through with no server round trip', async ({ page }) => {
  // The library reads the small cut's top file, then the Rebbeim's shelves, the Rebbe's first.
  const tree = page.waitForResponse((response) => /\/_\/catalog\/shelf-rh-aaaaaas3\.[\w.-]+\.json$/.test(response.url()));
  await page.goto('/library');
  await tree;
  const asked = serverReads(page);

  await page.getByRole('link', { name: /^הרבי/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הרבי');
  // A shelf with one sefer on it is that sefer, here too.
  await page.getByRole('link', { name: /^שיחות לדוגמה/ }).click();
  await expect(page).toHaveURL(/\/sample-sichos$/);
  await expect(page.getByRole('link', { name: /^מפתח לדוגמה/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'חלקים' }).getByRole('link', { name: 'חלק י״ב' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('חלק י״ב');
  await expect(page.getByRole('link', { name: /שיחה ב׳ לדוגמה/ })).toHaveAttribute('href', '/sample-sichos/12/2');
  await expect(page.getByText(/עמ׳ 20/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/sample-sichos$/);
  expect(asked).toEqual([]);

  // A sicha is not in the snapshot: its page is asked of the server.
  await page.getByRole('navigation', { name: 'חלקים' }).getByRole('link', { name: 'חלק י״ב' }).click();
  await page.getByRole('link', { name: /שיחה ב׳ לדוגמה/ }).click();
  await expect(page).toHaveURL(/\/sample-sichos\/12\/2$/);
  expect(asked.length).toBeGreaterThan(0);
});

test('a page opened from a link reads its own shelf, and the next tap under it is drawn here', async ({ page }) => {
  // The shelf's file is read first, then (with it) the sefer's units.
  const units = page.waitForResponse((response) => /\/_\/catalog\/work-[\w.-]+\.json$/.test(response.url()));
  await page.goto('/sample-sichos');
  await units;
  const asked = serverReads(page);
  await page.getByRole('navigation', { name: 'חלקים' }).getByRole('link', { name: 'חלק י״ב' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('חלק י״ב');
  expect(asked).toEqual([]);
});

test('the small cut never reads the whole tree', async ({ page }) => {
  const read: string[] = [];
  page.on('request', (request) => {
    if (/\/_\/catalog\//.test(request.url())) read.push(new URL(request.url()).pathname);
  });
  const shelf = page.waitForResponse((response) => /\/_\/catalog\/shelf-/.test(response.url()));
  await page.goto('/library');
  await shelf;
  expect(read.filter((path) => /manifest|tree/.test(path))).toEqual([]);
});

test('a year of listening is drawn from the snapshot, with which events can be followed', async ({ page }) => {
  // Listening reads the small cut's years file.
  const tree = page.waitForResponse((response) => /\/_\/catalog\/years\.[\w.-]+\.json$/.test(response.url()));
  await page.goto('/listen/5747');
  await tree;
  const asked = serverReads(page);
  const bar = page.getByRole('navigation', { name: 'המקום באתר' });
  await bar.getByRole('button', { name: /תשמ״ז/ }).click();
  await page.getByRole('menuitemradio', { name: /תשל״ב/ }).click();
  await expect(page).toHaveURL(/\/listen\/5732$/);
  await expect(page.getByText(/עם המילים/)).toBeVisible();
  expect(asked).toEqual([]);
});

test("the page carries the index, and a Rebbe's page is drawn from the top file before his shelf's file comes", async ({ page }) => {
  // His shelf's file never comes here.
  await page.route(/\/_\/catalog\/shelf-/, (route) => route.abort());
  const top = page.waitForResponse((response) => /\/_\/catalog\/top\.[\w.-]+\.json$/.test(response.url()));
  await page.goto('/library');
  expect(JSON.parse((await page.locator('#catalog-index').textContent()) ?? 'null')).toMatchObject({ format: 2, top: expect.stringMatching(/^top\./) });
  await top;
  const asked = serverReads(page);
  await page.getByRole('link', { name: /^הרבי/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הרבי');
  await expect(page.locator('main a[href="/sample-sichos"]')).toBeVisible();
  expect(asked).toEqual([]);
});

test("a year of listening opened from a link is drawn from the snapshot's year file on the server, and kept ten minutes (#321)", async ({ page }) => {
  const answer = await page.goto('/listen/5732');
  expect(answer?.headers()['cache-control']).toContain('s-maxage=600');
  await expect(page.getByText(/עם המילים/)).toBeVisible();
  // A year listening does not list is not found, as before.
  expect((await page.goto('/listen/5800'))?.status()).toBe(404);
});
