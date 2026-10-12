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
  // The subject index entry the words name, read by a machine.
  await expect(main.getByRole('heading', { name: 'במפתח הענינים' })).toBeVisible();
  const entry = main.locator('a[href="/mafteach?q=%D7%A4%D7%A1%D7%A7%D7%94"]');
  await expect(entry).toContainText('34 מקומות ב־12 חלקים · מפתח לדוגמה');
  await expect(entry).toContainText('במכונה');
  // One place in one volume is said as such, and a checked entry has no machine label.
  const small = main.locator('a[href="/mafteach?q=%D7%A7%D7%98%D7%A0%D7%94"]');
  await expect(small).toContainText('מקום אחד בחלק אחד');
  await expect(small).not.toContainText('במכונה');
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

test('with the catalog in the browser, names come up at each letter, with no server', async ({ page }) => {
  // A made-up snapshot: its manifest, and the names file it points to (search/instant.ts).
  await page.route('**/catalog/manifest.json', (route) => route.fulfill({ json: { version: 't1', names: '/catalog/names-t1.json' } }));
  await page.route('**/catalog/names-t1.json', (route) =>
    route.fulfill({ json: { version: 't1', names: [['sefer', 'ספר לדוגמה', null, null, '/sample'], ['volume', 'חלק יב', null, 'ספר לדוגמה', '/sample/12']] } }),
  );
  let suggested = 0;
  await page.route('**/search/suggest*', (route) => {
    suggested++;
    return route.continue();
  });
  await page.goto('/search');
  await page.waitForLoadState('networkidle');
  const box = page.getByRole('searchbox');
  await box.pressSequentially('ספר לדו');
  await expect(page.locator('.sugg').getByRole('link', { name: /ספר לדוגמה/ })).toHaveAttribute('href', '/sample');
  await box.pressSequentially('גמה יב');
  await expect(page.locator('.sugg').getByRole('link', { name: /חלק יב/ })).toHaveAttribute('href', '/sample/12');
  expect(suggested).toBe(0);
});

test('a search from inside the site shows its frame at once, and the answers after', async ({ page }) => {
  await page.goto('/search');
  await page.waitForLoadState('networkidle');
  // The server takes its time; the page does not wait for it.
  let answer = () => {};
  const held = new Promise<void>((resolve) => (answer = resolve));
  await page.route('**/search.data*', async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole('link', { name: 'שמיני א' }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole('searchbox')).toHaveValue('שמיני א');
  await expect(page.locator('main')).toContainText('מחפשים בתוך הטקסטים');
  answer();
  await expect(page.locator('main')).toContainText('לא נמצא דבר');
});
