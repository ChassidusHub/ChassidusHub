import { expect, test } from '@playwright/test';

/**
 * Search: the box searches without the script (a plain form), keeps what was
 * asked, and answers in the shape of the prototype. The answers come from the
 * live API, so only the shape is checked here, never which items come back.
 */
test('a search opens its results and keeps the words in the box', async ({ page }) => {
  await page.goto('/search');
  const box = page.getByRole('searchbox');
  await expect(box).toBeFocused();
  await box.fill('באתי לגני');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(box).toHaveValue('באתי לגני');
  await expect(page).toHaveTitle(/באתי לגני/);
  await expect(page.locator('main')).toContainText(/ספרים ומאמרים|בתוך הטקסטים|התוועדויות|לא נמצא|לא ענה/);
});

test('the examples are searches', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('link', { name: 'שמיני א' }).click();
  await expect(page).toHaveURL(/q=%D7%A9%D7%9E%D7%99%D7%A0%D7%99/);
});
