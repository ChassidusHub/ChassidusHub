import { expect, test, type Page } from '@playwright/test';

// Who is signed in comes from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'the sample reader exists only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

test('signed out, the sign-in page offers a passkey, Google and an emailed link, and a new account', async ({ page }) => {
  await page.goto('/signin?return=%2Fsample%2F1%2F1');
  await expect(page.getByRole('button', { name: 'כניסה עם מפתח כניסה' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'כניסה עם Google' })).toHaveAttribute('href', '/_/auth/google/start?return=%2Fsample%2F1%2F1');
  await page.getByLabel('כתובת מייל').fill('reader@example.org');
  await page.getByRole('button', { name: 'שליחת קישור' }).click();
  await expect(page.getByText('שלחנו קישור אל')).toBeVisible();
  expect(await (await page.request.get('http://localhost:3002/_mails')).json()).toContain('reader@example.org');

  // A handle someone has is refused while typing; the button waits for a free one.
  const create = page.getByRole('button', { name: 'פתיחת חשבון' });
  await page.getByLabel('השם שיופיע ליד התיקונים שלכם').fill('קורא חדש');
  await page.getByLabel('שם משתמש, לאזכורים (@)').fill('taken');
  await expect(page.getByText('שם המשתמש הזה תפוס')).toBeVisible();
  await expect(create).toBeDisabled();
  await page.getByLabel('שם משתמש, לאזכורים (@)').fill('');
  await expect(create).toBeEnabled();
});

test('a refusal from the API is said in Hebrew', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('כתובת מייל').fill('x@y');
  await page.getByRole('button', { name: 'שליחת קישור' }).click();
  await expect(page.getByRole('alert')).toContainText('כתובת מייל, למשל');
});

test('signed out, the account page sends the reader to sign in', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByRole('link', { name: 'כניסה' }).last()).toHaveAttribute('href', '/signin?return=%2Faccount');
});

test('signed in, the account sheet names the reader, the account page changes their name, and signing out works', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'החשבון שלי' }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'החשבון שלי' });
  await expect(sheet.getByRole('link', { name: /קורא לדוגמה/ })).toHaveAttribute('href', '/account');
  await sheet.getByRole('link', { name: /קורא לדוגמה/ }).click();

  await expect(page.getByRole('heading', { name: 'מפתחות כניסה' })).toBeVisible();
  await expect(page.getByText('reader@example.org')).toBeVisible();
  const name = page.getByLabel('השם שיופיע ליד התיקונים שלכם');
  await expect(name).toHaveValue('קורא לדוגמה');
  await name.fill('קורא בשם אחר');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('נשמר.')).toBeVisible();
  await expect(name).toHaveValue('קורא בשם אחר');
  await page.request.post('http://localhost:3002/v1/auth/name', { headers: { cookie: 'rh_session=sample' }, data: { name: 'קורא לדוגמה' } });

  await page.getByRole('button', { name: 'יציאה מהחשבון' }).click();
  await page.waitForURL('/');
  expect((await page.context().cookies()).find((c) => c.name === 'rh_session')).toBeUndefined();
});
