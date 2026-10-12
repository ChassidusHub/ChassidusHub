import { expect, test } from '@playwright/test';

// The pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

test('a sicha shows its words at once in a stand-in face, and they hardly move when the Torah face comes', async ({ page }) => {
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
  // The words are there to read while the face is still coming, drawn in the stand-in.
  await expect(words).toBeVisible();
  const faces = () =>
    page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
  await expect.poll(faces).toContain('Torah stand-in');
  expect(await faces()).not.toContain('FrankRuehlCLM');
  release();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.05);
});

test('a sicha shows its words without the face if the face cannot come', async ({ page }) => {
  await page.route('**/frank-ruehl-clm-*.woff2', (route) => route.abort());
  await page.goto('/sample/1/1');
  await expect(page.locator('.torah')).toBeVisible();
});
