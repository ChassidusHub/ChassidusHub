import { expect, test, type Page } from '@playwright/test';

// The live fix and the machine's text come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'the sample live fix exists only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

test('signed out, a live fix shows its words before and after, and asks to sign in to decide', async ({ page }) => {
  await page.goto('/back');
  const card = page.locator('article.live');
  await expect(card.locator('del')).toHaveText('שניה');
  await expect(card.locator('ins')).toHaveText('שנייה');
  await expect(card.getByRole('link', { name: 'תיקון במילים' })).toHaveAttribute('href', '/sample/1/1');
  await expect(card.getByText('רק שומרי הספר הזה יכולים להשאיר או לבטל.')).toBeVisible();
  await expect(card.getByRole('button', { name: 'לבטל' })).toBeDisabled();
});

test('a keeper undoes a live fix, and a second decision is refused', async ({ page }, info) => {
  // It changes the stand-in API's state, which the phone and the desktop share: one of them is enough.
  test.skip(info.project.name !== 'desktop', 'one decision is enough');
  await page.request.get('http://localhost:3002/_live/reset');
  await signIn(page);
  await page.goto('/back');
  const card = page.locator('article.live');
  await expect(card.locator('ins')).toBeVisible();
  await card.getByRole('button', { name: 'לבטל' }).click();
  await expect(card.getByText('התיקון בוטל')).toBeVisible();
  expect(await (await page.request.get('http://localhost:3002/_live')).json()).toEqual({ '301': 'revert' });
  const again = await page.request.post('/_/back/301', { headers: { origin: 'http://localhost:3001' }, data: { verdict: 'approve' } });
  expect(again.status()).toBe(409);
});

test('another site cannot decide for a signed-in keeper', async ({ page }) => {
  await signIn(page);
  const refused = await page.request.post('/_/back/301', { headers: { origin: 'https://elsewhere.example' }, data: { verdict: 'revert' } });
  expect(refused.status()).toBe(403);
});

test('the machine’s text waiting for a check leads to where it is read', async ({ page }) => {
  await page.goto('/back');
  await page.getByRole('button', { name: 'כתב מכונה' }).click();
  await expect(page.getByRole('link', { name: /התוועדות לדוגמה/ })).toHaveAttribute('href', '/listen/5732/rh-3dvjfkyc');
  await expect(page.getByRole('link', { name: /שיחה שניה/ })).toContainText('0 מתוך 2 שורות נבדקו');
});
