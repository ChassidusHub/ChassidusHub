import { expect, test } from '@playwright/test';

/**
 * The pages kept by the service worker (public/sw.js): once the site has
 * been opened, About and the frames of the account and inbox open with
 * no network at all.
 */
test('kept pages open with no network', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('אודות ChassidusHub');
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('החשבון שלי');
  await context.setOffline(false);
});

test('a page drawn for a question is never kept', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const kept = await page.evaluate(async () => (await (await caches.open('pages-v1')).keys()).map((request) => new URL(request.url).pathname + new URL(request.url).search));
  expect(kept).toContain('/about');
  // The back room carries the keepers' lists in its page: never kept.
  expect(kept).not.toContain('/back');
  expect(kept.some((path) => path.includes('?'))).toBe(false);
});
