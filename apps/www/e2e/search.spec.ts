import { expect, test } from '@playwright/test';

/**
 * Search: the box searches without the script (a plain form), keeps what was
 * asked, suggests while typing, and answers in the shape of the prototype.
 * The answers are the stand-in API's made-up ones (e2e/fixture-search.ts).
 */

test('a search opens its results and keeps the words in the box', async ({ page }) => {
  await page.goto('/search');
  const box = page.getByRole('searchbox');
  await expect(box).toBeFocused();
  await box.fill('פסקה');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(box).toHaveValue('פסקה');
  await expect(page).toHaveTitle(/פסקה/);
  const main = page.locator('main');
  // The top answer, then each kind once: the top answer is not listed again.
  await expect(main.getByRole('region', { name: 'התשובה' })).toContainText('שיחה ראשונה');
  await expect(main.getByRole('link', { name: /שיחה ראשונה/ })).toHaveCount(1);
  await expect(main.getByRole('heading', { name: 'ספרים ומאמרים' })).toBeVisible();
  await expect(main.getByRole('link', { name: /מדף לדוגמה/ })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'התוועדויות' })).toBeVisible();
  await expect(main.locator('a[href="/farbrengens/5747-03-19"]')).toBeVisible();
  // The words inside the texts: what matched is marked, and what a machine read says so.
  await expect(main.getByRole('heading', { name: 'בתוך הטקסטים' })).toBeVisible();
  await expect(main.locator('mark')).toHaveText(['פסקה', 'פסקה']);
  await expect(main.locator('a[href="/farbrengens/5747-03-19?t=95"]')).toContainText('במכונה');
  await expect(main.locator('a[href="/sample/1/1#p1"]')).not.toContainText('במכונה');
});

test('while typing, the first names come up under the box', async ({ page }) => {
  await page.goto('/search');
  await page.waitForLoadState('networkidle');
  await page.getByRole('searchbox').pressSequentially('פס');
  await expect(page.locator('.sugg').getByRole('link', { name: /ספר לדוגמה/ }).first()).toBeVisible();
  await page.locator('.sugg').getByRole('link', { name: /מדף לדוגמה/ }).click();
  await expect(page).toHaveURL(/\/sets\/sample/);
});

test('a subject typed in English letters says which Hebrew word it searched', async ({ page }) => {
  await page.goto('/search?q=piska');
  await expect(page.locator('main')).toContainText('תוצאות עבור פסקה');
  await page.goto('/search?q=' + encodeURIComponent('פסקה'));
  await expect(page.locator('main')).not.toContainText('תוצאות עבור');
});

test('nothing found, and a search that failed, each say so', async ({ page }) => {
  await page.goto('/search?q=' + encodeURIComponent('אין כזה'));
  await expect(page.locator('main')).toContainText('לא נמצא דבר');
  await page.goto('/search?q=' + encodeURIComponent('תקלה'));
  await expect(page.locator('main')).toContainText('החיפוש לא ענה');
});

test('the examples are searches', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('link', { name: 'שמיני א' }).click();
  await expect(page).toHaveURL(/q=%D7%A9%D7%9E%D7%99%D7%A0%D7%99/);
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
  await box.fill('פסקה');
  release();
  await page.waitForLoadState('networkidle');
  await expect(box).toHaveValue('פסקה');
  await box.press('Enter');
  await expect(page).toHaveURL(/q=%D7%A4%D7%A1%D7%A7%D7%94/);
  await expect(box).toHaveValue('פסקה');
});

test('without the script, the box still searches', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/search');
  await page.getByRole('searchbox').fill('שמיני א');
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/q=%D7%A9%D7%9E%D7%99%D7%A0%D7%99/);
  await expect(page.getByRole('searchbox')).toHaveValue('שמיני א');
  await context.close();
});
