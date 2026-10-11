import { expect, test } from '@playwright/test';

// The pages and the saves come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

test('Edit opens the same page with only its own fields, and saves a name on leaving it', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: 'עריכה' }).click();
  await expect(page).toHaveURL(/\?edit/);
  await expect(page.getByRole('region', { name: 'עריכה' })).toContainText('רק התוכן של הדף הזה');

  const name = page.getByLabel('שם', { exact: true });
  await expect(name).toHaveValue('שיחה ראשונה');
  await name.fill('שיחה א׳');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('נשמר. עין שנייה תבדוק');
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { entityId: string; data: { label: unknown } }[];
  expect(sent.at(-1)).toMatchObject({ entityId: 'rh-aaaaaab1', data: { label: { he: 'שיחה א׳' } } });

  // The sefer it is in is edited on its own page.
  await expect(page.getByRole('link', { name: /לערוך שם/ })).toHaveAttribute('href', '/sample?edit');
  await page.getByRole('link', { name: 'סיום' }).click();
  await expect(page).toHaveURL(/\/sample\/1\/1$/);
  await expect(page.getByLabel('שם', { exact: true })).toHaveCount(0);
});

test('signed out, Edit says to sign in and keeps the page as it was', async ({ page }) => {
  await page.goto('/sample/1/1?edit');
  await page.waitForLoadState('networkidle');
  const name = page.getByLabel('שם', { exact: true });
  await name.fill('שם אחר');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('כדי לערוך צריך להיכנס');
});
