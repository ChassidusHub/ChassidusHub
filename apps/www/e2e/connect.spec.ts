import { expect, test, type Page } from '@playwright/test';

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

test('the connect page gives the address to paste and each app’s steps', async ({ page }) => {
  await page.goto('/connect');
  await expect(page.getByLabel('הכתובת להדבקה')).toHaveValue('https://api.chassidushub.org/mcp');
  await expect(page.getByRole('link', { name: 'פתיחת ההגדרות ב-Claude' })).toHaveAttribute('href', 'https://claude.ai/settings/connectors');
  await page.getByRole('button', { name: 'Claude Code' }).click();
  await expect(page.getByText('claude mcp add --transport http chassidushub https://api.chassidushub.org/mcp')).toBeVisible();
});

test.describe('on the local build', () => {
  test.skip(!!process.env.BASE_URL, 'the request to connect and the keys exist only in the stand-in API');
  // They change the stand-in API's state, which the phone and the desktop share: one of them is enough.
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one is enough');
    await page.request.get('http://localhost:3002/_tokens/reset');
  });

  test('signed out, connecting an app asks to sign in and comes back', async ({ page }) => {
    await page.goto('/oauth/consent?request=oar-sample');
    await expect(page.getByRole('link', { name: 'כניסה' }).last()).toHaveAttribute('href', `/signin?return=${encodeURIComponent('/oauth/consent?request=oar-sample')}`);
  });

  test('a signed-in person allows an app to read only, and goes back to it', async ({ page }) => {
    await signIn(page);
    await page.goto('/oauth/consent?request=oar-sample');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('לחבר את Claude לחשבון שלכם?');
    await expect(page.getByText('claude.ai', { exact: true })).toBeVisible();
    await page.getByLabel(/לשלוח הצעות בשמכם/).uncheck();
    await page.getByRole('button', { name: 'אישור' }).click();
    await expect(page).toHaveURL(/_callback\?approve=true/);
    expect(await (await page.request.get('http://localhost:3002/_consent')).json()).toEqual({ approve: true, scopes: ['read'] });
  });

  test('a request already answered says so', async ({ page }) => {
    await signIn(page);
    await page.request.post('/_/oauth/requests/oar-sample', { headers: { origin: 'http://localhost:3001' }, data: { approve: false } });
    await page.goto('/oauth/consent?request=oar-sample');
    await expect(page.getByRole('alert')).toContainText('כבר לא בתוקף');
  });

  test('a bad request to connect is said plainly', async ({ page }) => {
    await page.goto('/oauth/consent?error=invalid_redirect');
    await expect(page.getByRole('alert')).toContainText('לא נחזיר אתכם אליה');
  });

  test('the account page makes an API key once, revokes it, and disconnects an app', async ({ page }) => {
    await signIn(page);
    await page.goto('/account');
    const keys = page.locator('section.panel', { has: page.getByRole('heading', { name: 'מפתחות API' }) });
    await keys.getByLabel(/שם למפתח חדש/).fill('my script');
    await keys.getByRole('button', { name: 'יצירת מפתח' }).click();
    await expect(keys.getByLabel('המפתח החדש')).toHaveValue('chp_abcdSECRETsample');
    await expect(keys.getByText('my script · chp_abcd…')).toBeVisible();
    await keys.getByRole('button', { name: 'ביטול' }).click();
    await expect(keys.getByText('my script · chp_abcd…')).toHaveCount(0);
    const apps = page.locator('section.panel', { has: page.getByRole('heading', { name: 'אפליקציות AI מחוברות' }) });
    await expect(apps.getByText('Claude · claude.ai')).toBeVisible();
    await apps.getByRole('button', { name: 'ניתוק' }).click();
    await expect(apps.getByText('עוד לא חיברתם אפליקציה.')).toBeVisible();
    expect(await (await page.request.get('http://localhost:3002/_tokens')).json()).toEqual([]);
  });

  test('only the keys’ own addresses pass on to the API', async ({ page }) => {
    await signIn(page);
    expect((await page.request.get('/_/tokens/nope')).status()).toBe(404);
    expect((await page.request.get('/_/oauth/clients')).status()).toBe(404);
  });
});
