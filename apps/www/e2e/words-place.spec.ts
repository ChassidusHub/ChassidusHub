import { expect, test } from '@playwright/test';

// The pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');
// The words' late arrival is staged on the page's own request, so the service worker stays out of it.
test.use({ serviceWorkers: 'block' });

test('a sicha opened by a tap keeps its notes and next links out of sight until its words come, so nothing jumps', async ({ page }) => {
  await page.goto('/sample/1/2');
  await page.waitForLoadState('networkidle');
  // Its words come late, as on a slow phone.
  let release = () => {};
  const held = new Promise<void>((ok) => (release = ok));
  await page.route('**/_/words/**', async (route) => {
    await held;
    await route.continue();
  });
  await page.evaluate(() => {
    (window as unknown as { shift: number }).shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) (window as unknown as { shift: number }).shift += entry.value;
      }
    }).observe({ type: 'layout-shift' });
  });
  await page.getByRole('link', { name: /שיחה ראשונה/ }).last().click();
  await expect(page).toHaveURL(/\/sample\/1\/1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('שיחה ראשונה');
  await expect(page.getByRole('navigation', { name: 'הקודם והבא' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'הערות' })).toBeHidden();
  // Past the half second after the tap that the shift's own exemption covers.
  await page.waitForTimeout(800);
  release();
  await expect(page.locator('.torah p')).toHaveCount(4);
  await expect(page.getByRole('navigation', { name: 'הקודם והבא' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'הערות' })).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.05);
});
