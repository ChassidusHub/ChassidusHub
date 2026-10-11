import { expect, test } from '@playwright/test';

/**
 * Search: the box searches without the script (a plain form), keeps what was
 * asked, and answers in the shape of the prototype. The answers come from the
 * live API, so only the shape is checked here, never which items come back;
 * a first search there can take several seconds, and the address changes only
 * once its answers are in, so these waits are long.
 */
test.setTimeout(60_000);

test('a search opens its results and keeps the words in the box', async ({ page }) => {
  await page.goto('/search');
  const box = page.getByRole('searchbox');
  await expect(box).toBeFocused();
  await box.fill('באתי לגני');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/, { timeout: 30_000 });
  await expect(box).toHaveValue('באתי לגני');
  await expect(page).toHaveTitle(/באתי לגני/);
  await expect(page.locator('main')).toContainText(/ספרים ומאמרים|בתוך הטקסטים|התוועדויות|לא נמצא|לא ענה/, { timeout: 30_000 });
});

test('the examples are searches', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('link', { name: 'שמיני א' }).click();
  await expect(page).toHaveURL(/q=%D7%A9%D7%9E%D7%99%D7%A0%D7%99/, { timeout: 30_000 });
});

test('words typed before the script has loaded are kept', async ({ page }) => {
  // A slow phone: the page's scripts arrive late, while the reader is already typing.
  let release = () => {};
  const scripts = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/*.js', async (route) => {
    await scripts;
    await route.continue();
  });
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  const box = page.getByRole('searchbox');
  await box.fill('באתי לגני');
  release();
  await page.waitForLoadState('networkidle');
  await expect(box).toHaveValue('באתי לגני');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=%D7%91%D7%90%D7%AA%D7%99/, { timeout: 30_000 });
  await expect(box).toHaveValue('באתי לגני');
});

test('without the script, the box still searches', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/search');
  await page.getByRole('searchbox').fill('שמיני א');
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/q=%D7%A9%D7%9E%D7%99%D7%A0%D7%99/, { timeout: 30_000 });
  await expect(page.getByRole('searchbox')).toHaveValue('שמיני א');
  await context.close();
});
