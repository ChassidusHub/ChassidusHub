import { expect, test } from '@playwright/test';

/**
 * The library on the stand-in API's sample catalog (fixture-library.ts): from
 * the library to a Rebbe, his sefer and a volume by rows and the volume grid,
 * then across by the path bar, whose every level opens the other choices there.
 */
test.skip(!!process.env.BASE_URL, 'the sample catalog is only on the local build');

test('walks down the library and across by the path bar', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('link', { name: /^הרבי/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הרבי');

  // A shelf with one sefer on it is that sefer.
  await page.getByRole('link', { name: /^שיחות לדוגמה/ }).click();
  await expect(page).toHaveURL(/\/sample-sichos$/);
  await expect(page.getByRole('link', { name: /^מפתח לדוגמה/ })).toBeVisible();
  await page.getByRole('navigation', { name: 'חלקים' }).getByRole('link', { name: 'חלק י״ב' }).click();
  await expect(page).toHaveURL(/\/sample-sichos\/12$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('חלק י״ב');
  await expect(page.getByRole('link', { name: /שיחה ב׳ לדוגמה/ })).toHaveAttribute('href', '/sample-sichos/12/2');

  // The volume's level in the path bar lists the other volumes; the next one is a tap away.
  const bar = page.getByRole('navigation', { name: 'המקום באתר' });
  await bar.getByRole('button', { name: /חלק י״ב/ }).click();
  await page.getByRole('menuitemradio', { name: /חלק י״ג/ }).click();
  await expect(page).toHaveURL(/\/sample-sichos\/13$/);

  // The shelf's own address opens at the sefer.
  await page.goto('/sets/the-rebbe-sample-sichos');
  await expect(page).toHaveURL(/\/sample-sichos$/);
});

test("a Rebbe's page lists his sefarim themselves, then the shelves with more on them (#268)", async ({ page }) => {
  await page.goto('/sets/the-rebbe');
  const sefarim = page.getByRole('heading', { name: 'ספרים', exact: true });
  await expect(sefarim).toBeVisible();
  // His sefarim are one tap away, whatever shelf they are on.
  await expect(page.getByRole('link', { name: /^שיחות לדוגמה/ })).toHaveAttribute('href', '/sample-sichos');
  await expect(page.getByRole('link', { name: /^אגרות לדוגמה/ }).first()).toHaveAttribute('href', '/sample-letters');
  // A shelf is listed when it holds more than those sefarim: the letters' shelf, for its book of more; not the sichos' shelf.
  await expect(page.getByRole('heading', { name: 'מדפים' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^אגרות לדוגמה/ }).nth(1)).toHaveAttribute('href', '/sets/the-rebbe-sample-letters');
  await expect(page.locator('a[href="/sets/the-rebbe-sample-sichos"]')).toHaveCount(0);
});

test('the other shelves leave out an empty one', async ({ page }) => {
  await page.goto('/library?more');
  await expect(page.getByRole('link', { name: /^ספרים נוספים לדוגמה/ })).toBeVisible();
  await expect(page.getByText('מדף ריק לדוגמה')).toHaveCount(0);
});

test('a path with nothing at it is not found, in the site\'s frame with a way on (#264)', async ({ page }) => {
  const response = await page.goto('/sample-sichos/999');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('הדף לא נמצא');
  await expect(page.locator('header.top')).toBeVisible();
  await page.getByRole('navigation', { name: 'ראשי' }).getByRole('link', { name: 'ספרייה' }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/library$/);
});
