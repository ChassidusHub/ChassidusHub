import { expect, test } from '@playwright/test';

// The pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

test('a sicha waits for its Torah face, so its words never move when the face comes', async ({ page }) => {
  // The face comes late, as on a slow phone, well after the page has painted.
  let release = () => {};
  const held = new Promise<void>((ok) => (release = ok));
  await page.route('**/frank-ruehl-clm-*.woff2', async (route) => {
    await held;
    await route.continue();
  });
  await page.addInitScript(() => {
    (window as unknown as { shift: number }).shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) (window as unknown as { shift: number }).shift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/sample/1/1', { waitUntil: 'domcontentloaded' });
  const words = page.locator('.torah');
  // The frame is there; the words keep their place, not drawn in a stand-in face.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(words).toBeHidden();
  release();
  await expect(words).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.05);
});

test('a sicha shows its words without the face if the face cannot come', async ({ page }) => {
  await page.route('**/frank-ruehl-clm-*.woff2', (route) => route.abort());
  await page.goto('/sample/1/1');
  await expect(page.locator('.torah')).toBeVisible();
});
