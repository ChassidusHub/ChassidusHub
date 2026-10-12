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
  await page.getByText('העץ, לפני ואחרי').click();
  const second = page.getByRole('region', { name: 'ספר שני לדוגמה' });
  await expect(second.locator('.bt-after .bt-in')).toContainText('שיחה ב');
  await expect(second.locator('.bt-after .bt-in .bt-mark')).toHaveText('נכנס');
  await expect(page.getByRole('link', { name: 'להיכנס' })).toHaveAttribute('href', '/signin?return=%2Fback%2Fbatch%2F405');
});

test('on a phone, Before shows what leaves; on a desktop both sides show at once', async ({ page }, info) => {
  await page.goto('/back/batch/405');
  await page.getByText('העץ, לפני ואחרי').click();
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
  await page.getByRole('button', { name: 'לאשר', exact: true }).click();
  // The sheet says again what is being decided before the second tap.
  const sheet = page.getByRole('dialog', { name: 'לאשר את ההצעה?' });
  await expect(sheet).toContainText('244 פריטים: 241 מועברים · 1 מאוחד · 6 בשם חדש');
  await sheet.getByRole('button', { name: 'כן, לאשר' }).click();
  await expect(page.getByText('אישרתם, והשינוי נכנס לספרייה.')).toBeVisible();
  const done = (await (await page.request.get('http://localhost:3002/_suggestions')).json()) as { id: number; what: string; body: { verdict?: string } }[];
  expect(done).toContainEqual(
    expect.objectContaining({
      id: 405,
      what: 'POST reviews',
      body: expect.objectContaining({ verdict: 'approve' }),
    }),
  );
  await page.getByRole('button', { name: 'להצעה הבאה' }).click();
  await expect(page).toHaveURL(/\/back\/batch\/406$/);
  await expect(page.getByRole('region', { name: 'בשם חדש' }).locator('.br-old')).toHaveText('שיחה א');
});

test('sending back one’s own batch closes it with the note, since nobody sends their own back to themselves', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one decision is enough');
  await page.request.get('http://localhost:3002/_suggestions/reset');
  await signIn(page);
  await page.goto('/back/batch/406');
  await page.getByRole('button', { name: 'להחזיר', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'להחזיר את ההצעה?' });
  await sheet.getByLabel('מה לתקן (לא חובה)').fill('חסר מקור לדוגמה.');
  await sheet.getByRole('button', { name: 'כן, להחזיר' }).click();
  await expect(page.getByText('ההצעה נסגרה עם ההערה')).toBeVisible();
  const done = (await (await page.request.get('http://localhost:3002/_suggestions')).json()) as { id: number; what: string; body: { body?: string } }[];
  expect(done.filter((d) => d.id === 406).map((d) => d.what)).toEqual(['POST comments', 'POST withdraw']);
  expect(done.find((d) => d.id === 406)!.body.body).toBe('חסר מקור לדוגמה.');
});

test('a big batch: its counts and where things go first, then samples of each kind, then the whole list a page at a time', async ({ page }) => {
  await page.goto('/back/batch/405');
  const summary = page.locator('.br-sum');
  await expect(summary).toContainText('244 פריטים');
  await expect(summary).toContainText('241 מועברים');
  await expect(summary.locator('.br-flows li').first()).toContainText('ספר ראשון לדוגמה');
  await expect(summary.locator('.br-flows li').first()).toContainText('201');
  // Samples of each kind, the first and the last among them.
  const moved = page.getByRole('region', { name: 'מועברים' });
  await expect(moved.locator('.br-row')).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'בשם חדש' })).toContainText('שיחה לדוגמה 40');
  // The list: thirty at a time, the next thirty a tap away, and a search that narrows it.
  const list = page.locator('.br-list');
  await expect(list.locator('.br-row')).toHaveCount(30);
  await expect(list).toContainText('1–30 מתוך 244');
  await list.getByRole('button', { name: 'הבאים' }).click();
  await expect(list).toContainText('31–60 מתוך 244');
  await list.getByRole('searchbox').fill('שיחה 120 לדוגמה');
  await expect(list.locator('.br-row')).toHaveCount(1);
  await list.getByRole('searchbox').fill('');
  await list.getByRole('button', { name: 'נמחקים 2' }).click();
  await expect(list.locator('.br-row')).toHaveCount(2);
});

test('approve and send back stay in reach at the foot of the screen while a big batch is read', async ({ page }) => {
  await signIn(page);
  await page.goto('/back/batch/405');
  await expect(page.locator('.br-list .br-row').first()).toBeVisible();
  await page.mouse.wheel(0, 3000);
  await expect(page.getByRole('button', { name: 'לאשר', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'להחזיר', exact: true })).toBeInViewport();
});
