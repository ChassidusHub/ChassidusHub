import { expect, test } from '@playwright/test';

/** The app shell: the place a page is in, and the light / dark switch that survives a reload. */
test('marks the page’s place, and keeps the theme the reader picks', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const places = page.getByRole('navigation', { name: 'ראשי' }).filter({ visible: true });
  await expect(places.getByRole('link', { name: 'בית', exact: true })).toHaveAttribute('aria-current', 'page');

  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'החשבון שלי' }).click();
    await page.getByRole('dialog', { name: 'החשבון שלי' }).getByRole('button', { name: 'מצב כהה' }).click();
  } else {
    await places.getByRole('button', { name: 'מצב כהה' }).click();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
