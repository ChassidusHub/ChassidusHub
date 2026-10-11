import { expect, test } from '@playwright/test';

/**
 * The site-wide player, with the made-up recording on /ui: it keeps playing
 * while the reader moves to another page, and its parts, speed and words work.
 */
test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] } });

test('keeps playing across pages, switches parts and speed, and follows the words', async ({ page }, info) => {
  await page.goto('/ui');
  await page.getByRole('button', { name: 'נגינת הקלטה לדוגמה' }).click();
  const close = page.getByRole('button', { name: 'סגירת הנגן' });
  await expect(close).toBeVisible();

  // To another page through the bar: the player stays, and time goes on.
  await page.getByRole('navigation', { name: 'ראשי' }).filter({ visible: true }).getByRole('link', { name: 'חיפוש' }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(close).toBeVisible();
  const slider = page.getByRole('slider', { name: 'מקום בחלק' }).filter({ visible: true }).first();
  if (info.project.name === 'phone') await page.getByRole('button', { name: /פתיחת הנגן/ }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'מקום בחלק' }).filter({ visible: true }).first().getAttribute('aria-valuenow'))).toBeGreaterThan(0);

  // The words: the phrase being heard is lit.
  if (info.project.name === 'desktop') await page.getByRole('button', { name: 'המילים' }).click();
  await expect(page.locator('.yi .p.now').filter({ visible: true })).toHaveCount(1);

  // The second part, from the list of parts; it has no words.
  await page.getByRole('button', { name: 'חלקים' }).filter({ visible: true }).first().click();
  await page.getByRole('dialog', { name: 'חלקי ההקלטה' }).getByRole('button', { name: /ניגון/ }).click();
  await expect(page.getByText('אין עדיין מילים לחלק הזה').filter({ visible: true })).toBeVisible();
  await expect(slider).toHaveAttribute('aria-valuemax', '30');

  await page.getByRole('button', { name: /^מהירות/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: /^מהירות 1.25/ }).filter({ visible: true }).first()).toBeVisible();
});

test('the player and its words work from the keyboard', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the full-screen player is the phone’s');
  await page.goto('/ui');
  await page.getByRole('button', { name: 'נגינת הקלטה לדוגמה' }).click();
  const open = page.getByRole('button', { name: /פתיחת הנגן/ });
  await open.focus();
  await page.keyboard.press('Enter');
  const full = page.getByRole('dialog', { name: 'נגן' });
  await expect(page.getByRole('button', { name: 'הקטנת הנגן' })).toBeFocused();

  // Space on a phrase plays from it, without scrolling the words.
  const phrase = full.locator('.yi .p').nth(2);
  await phrase.focus();
  await page.keyboard.press(' ');
  await expect(phrase).toHaveClass(/now/);

  await page.keyboard.press('Escape');
  await expect(full).toHaveAttribute('inert', '');
  await expect(open).toBeFocused();
});
