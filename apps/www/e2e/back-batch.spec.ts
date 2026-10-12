import { expect, test, type Page } from '@playwright/test';

// The catalog batches come from the stand-in API (fixture-suggestions.ts): #46 moves a sicha between two sefarim, #47 renames one.
test.skip(!!process.env.BASE_URL, 'the sample batches exist only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

test('the back room lists the catalog batches, oldest first, each opening its own page', async ({ page }) => {
  await page.goto('/back?tab=catalog');
  const rows = page.getByRole('link', { name: /לדוגמה/ });
  await expect(rows.first()).toHaveAttribute('href', '/back/batch/405');
  await expect(rows.nth(1)).toHaveAttribute('href', '/back/batch/406');
  // A fix to words is not a catalog batch.
  await expect(page.getByRole('link', { name: /תוספת הערה/ })).toHaveCount(0);
});

test('a batch shows its research note and where each item goes, and asks to sign in to decide', async ({ page }) => {
  await page.goto('/back/batch/405');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('סידור שיחות בספר לדוגמה');
  await expect(page.getByText('השיחה השנייה שייכת לספר השני')).toBeVisible();
  await expect(page.getByText('1 מתוך 2')).toBeVisible();
  const second = page.getByRole('region', { name: 'ספר שני לדוגמה' });
  await expect(second.locator('.bt-after .bt-in')).toContainText('שיחה ב');
  await expect(second.locator('.bt-after .bt-in .bt-mark')).toHaveText('נכנס');
  await expect(page.getByRole('link', { name: 'להיכנס' })).toHaveAttribute('href', '/signin?return=%2Fback%2Fbatch%2F405');
});

test('on a phone, Before shows what leaves; on a desktop both sides show at once', async ({ page }, info) => {
  await page.goto('/back/batch/405');
  const first = page.getByRole('region', { name: 'ספר ראשון לדוגמה' });
  const out = first.locator('.bt-before .bt-out');
  if (info.project.name === 'phone') {
    await expect(out).toBeHidden();
    await page.getByRole('button', { name: 'לפני' }).click();
    await expect(out).toBeVisible();
  } else await expect(out).toBeVisible();
  await expect(out.locator('.bt-mark')).toHaveText('יוצא');
});

test('a keeper approves a batch with one tap and goes on to the next', async ({ page }, info) => {
  // It changes the stand-in API's state, which the phone and the desktop share: one of them is enough.
  test.skip(info.project.name !== 'desktop', 'one decision is enough');
  await page.request.get('http://localhost:3002/_suggestions/reset');
  await signIn(page);
  await page.goto('/back/batch/405');
  await page.getByRole('button', { name: 'לאשר' }).click();
  await expect(page.getByText('אישרתם, והשינוי נכנס לספרייה.')).toBeVisible();
  const done = (await (await page.request.get('http://localhost:3002/_suggestions')).json()) as { id: number; what: string; body: { verdict?: string } }[];
  expect(done).toContainEqual(expect.objectContaining({ id: 405, what: 'POST reviews', body: expect.objectContaining({ verdict: 'approve' }) }));
  await page.getByRole('button', { name: 'להצעה הבאה' }).click();
  await expect(page).toHaveURL(/\/back\/batch\/406$/);
  await expect(page.getByText('היה: שיחה א')).toBeVisible();
});

test('sending back one’s own batch closes it with the note, since nobody sends their own back to themselves', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one decision is enough');
  await page.request.get('http://localhost:3002/_suggestions/reset');
  await signIn(page);
  await page.goto('/back/batch/406');
  await page.getByRole('button', { name: 'להוסיף הערה' }).click();
  await page.getByLabel('הערה (לא חובה)').fill('חסר מקור לדוגמה.');
  await page.getByRole('button', { name: 'להחזיר' }).click();
  await expect(page.getByText('ההצעה נסגרה עם ההערה')).toBeVisible();
  const done = (await (await page.request.get('http://localhost:3002/_suggestions')).json()) as { id: number; what: string; body: { body?: string } }[];
  expect(done.filter((d) => d.id === 406).map((d) => d.what)).toEqual(['POST comments', 'POST withdraw']);
  expect(done.find((d) => d.id === 406)!.body.body).toBe('חסר מקור לדוגמה.');
});
