import { expect, test } from '@playwright/test';

/** The design system's moving parts, on its own page (/ui). */
test('the path bar opens the other choices at a level, and filters them', async ({ page }, info) => {
  await page.goto('/ui');
  await page.getByRole('button', { name: 'חלק י״ב' }).click();
  const menu = page.getByRole('menu', { name: 'חלקי ליקוטי שיחות' });
  await expect(menu.getByRole('menuitemradio')).toHaveCount(39);
  await expect(menu.getByRole('menuitemradio', { name: 'חלק י״ב' })).toHaveAttribute('aria-checked', 'true');
  // On a phone the list opens as a sheet, where the filter waits for a tap rather than popping the keyboard up.
  if (info.project.name === 'phone') await expect(page.getByRole('dialog', { name: 'חלקי ליקוטי שיחות' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'סינון' }).fill('יב');
  await expect(menu.getByRole('menuitemradio')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('the path bar works from the keyboard alone', async ({ page }) => {
  await page.goto('/ui');
  await page.getByRole('button', { name: 'חלק י״ב' }).focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: 'חלקי ליקוטי שיחות' });
  await expect(menu.getByRole('menuitemradio')).toHaveCount(39);
  // Focus is inside the list, so typing filters it, the arrows move and Enter picks.
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('.menu, [role=dialog]'));
  await expect.poll(inside).toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('.mi.active')).toHaveText('חלק י״ב');
  await page.keyboard.press('ArrowDown');
  await expect(menu.locator('.mi.active')).toHaveText('חלק י״ג');
  await page.keyboard.press('Tab');
  await expect.poll(inside).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('a toast offers Undo, and a sheet closes on Escape', async ({ page }) => {
  await page.goto('/ui');
  await page.getByRole('button', { name: 'הודעה עם ביטול' }).click();
  await expect(page.getByRole('status')).toContainText('התיקון עלה לאתר');
  await page.getByRole('status').getByRole('button', { name: 'ביטול' }).click();
  await expect(page.getByRole('status')).toContainText('התיקון בוטל');

  await page.getByRole('button', { name: 'פתיחת גיליון' }).click();
  const sheet = page.getByRole('dialog', { name: 'הערה 12' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'פתיחת גיליון' })).toBeFocused();
});
