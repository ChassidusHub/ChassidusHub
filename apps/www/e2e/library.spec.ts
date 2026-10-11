import { expect, test } from '@playwright/test';

/**
 * The library on the live catalog: from the library to a Rebbe, his sefer,
 * a volume and a sicha by rows and the volume grid, then across by the path
 * bar, whose every level opens the other choices there.
 */
test('walks down the library and across by the path bar', async ({ page }) => {
  await page.goto('/library');
  await page.getByRole('link', { name: /^כ״ק אדמו״ר/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('כ״ק אדמו״ר');

  await page.getByRole('link', { name: /^לקוטי שיחות/ }).first().click();
  await expect(page).toHaveURL(/\/likkutei-sichos$/);
  await page.getByRole('navigation', { name: 'חלקים' }).getByRole('link', { name: 'חלק י״ב' }).click();
  await expect(page).toHaveURL(/\/likkutei-sichos\/12$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('חלק י״ב');

  // The volume's level in the path bar lists the other volumes; the next one is a tap away.
  const bar = page.getByRole('navigation', { name: 'המקום באתר' });
  await bar.getByRole('button', { name: /חלק י״ב/ }).click();
  await page.getByRole('menuitemradio', { name: /חלק י״ג/ }).click();
  await expect(page).toHaveURL(/\/likkutei-sichos\/13$/);

  // A shelf with one sefer on it opens at the sefer.
  await page.goto('/sets/the-rebbe-likkutei-sichos');
  await expect(page).toHaveURL(/\/likkutei-sichos$/);
});

test('a path with nothing at it is not found', async ({ page }) => {
  const response = await page.goto('/likkutei-sichos/999');
  expect(response?.status()).toBe(404);
});
