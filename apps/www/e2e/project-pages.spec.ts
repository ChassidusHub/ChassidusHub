import { expect, test, type Page } from '@playwright/test';
import { shown } from './streamed';

// The catalog as a whole and the developer docs. The docs are the repository's own files; the rest comes from the stand-in API (fixture-project-pages.ts).

test('the developer docs are the repository’s files, in English inside the Hebrew frame', async ({ page }) => {
  await page.goto('/developers');
  await expect(page.locator('.doc')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.doc')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /מפתחות וכניסה/ }).click();
  await expect(page).toHaveURL(/\/developers\/auth$/);
  await expect(page.locator('.doc h1')).toHaveText('Tokens and signing in');
  await expect(page.locator('.crumbs [aria-current="page"]')).toHaveText('מפתחות וכניסה');
  await expect(page.getByRole('link', { name: 'עריכת הדף ב-GitHub' })).toHaveAttribute('href', 'https://github.com/ChassidusHub/ChassidusHub/edit/main/docs/developers/auth.md');
  // Each code box has its Copy button once the page's script runs.
  await expect(page.locator('.codebox .copy').first()).toBeVisible();
});

test('a page of the docs opened from another one comes whole, with its code boxes', async ({ page }) => {
  await page.goto('/developers/getting-started');
  await page.getByRole('link', { name: /הבא/ }).click();
  await expect(page).toHaveURL(/\/developers\/auth$/);
  await expect(page.locator('.doc .prose h2').first()).toBeVisible();
  expect(await page.locator('.doc .prose').innerHTML()).toContain('codebox');
});

test('an unknown docs page is not found', async ({ request }) => {
  expect((await request.get('/developers/nothing')).status()).toBe(404);
});

test('the sitemap and llms.txt list the developer docs and the catalog pages; llms-full.txt holds the docs’ own words', async ({ request }) => {
  const pages = await (await request.get('/sitemaps/pages.xml')).text();
  for (const path of ['/developers/auth', '/developers/reference', '/health', '/status', '/missing', '/projects', '/mirrors', '/models']) expect(pages).toContain(`${path}</loc>`);
  expect(await (await request.get('/llms.txt')).text()).toContain('/developers/getting-started): Your first requests');
  expect(await (await request.get('/llms-full.txt')).text()).toContain('(docs/developers/auth.md) -->');
});

test('about leads to the developer docs and the pages about the catalog', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('link', { name: 'התיעוד למפתחים' })).toHaveAttribute('href', '/developers');
  for (const path of ['/health', '/status', '/missing', '/projects', '/mirrors', '/models', '/developers/reference']) await expect(page.locator(`a[href="${path}"]`).first()).toBeVisible();
});

test('the models page has the scores and nothing that leads to the models', async ({ page }) => {
  await page.goto('/models');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('המודלים ומדדי הביצוע');
  await expect(page.locator('table').first()).toContainText('chassidushub-kraken-ls-v1');
  expect(await page.locator('main a[href^="http"]').count()).toBe(0);
});

test.describe('from the stand-in API', () => {
  test.skip(!!process.env.BASE_URL, 'the sample catalog exists only on the local build');

  const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

  test('the health of the catalog, year by year, folds a long list until asked', async ({ page }) => {
    await page.goto('/health');
    await shown(page);
    await expect(page.getByRole('link', { name: 'תשמ״ה' })).toHaveAttribute('href', '/listen/5745');
    await expect(page.locator('.figure').first()).toContainText('83%');
    const fold = page.locator('details.fold', { hasText: 'הצגת הכל (12)' });
    await expect(fold).toBeVisible();
    await expect(page.getByText('סריקה לדוגמה 12')).toBeHidden();
    await fold.locator('summary').click();
    await expect(page.getByText('סריקה לדוגמה 12')).toBeVisible();
  });

  test('the status says everything works, part by part, and the last incident', async ({ page }) => {
    await page.goto('/status');
    await shown(page);
    await expect(page.locator('.banner')).toContainText('הכל עובד');
    await expect(page.locator('.checks > li')).toHaveCount(7);
    await expect(page.locator('.days').first().locator('li')).toHaveCount(90);
    await expect(page.locator('.incidents')).toContainText('נמשכה 15 דק׳');
  });

  test('the Missing board by kind and by year', async ({ page }) => {
    await page.goto('/missing');
    await shown(page);
    await expect(page.locator('.chip.on')).toContainText('הקלטות');
    await page.locator('details.years summary').click();
    await page.getByRole('link', { name: /^תשמ״ו/ }).click();
    await expect(page).toHaveURL(/year=5746/);
    await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('בשנת תשמ״ו');
    await page.getByRole('link', { name: /^קבצים/ }).click();
    await expect(page.getByText('הקלטה לדוגמה')).toBeVisible();
    await expect(page.getByRole('link', { name: 'איפה חיפשו' })).toHaveAttribute('href', 'https://example.org/sample.mp3');
  });

  test('projects: open and closed, and one project’s progress', async ({ page }) => {
    await page.goto('/projects');
    await shown(page);
    await expect(page.locator('.projects li')).toHaveCount(1);
    await page.getByRole('link', { name: /סגורים/ }).click();
    await shown(page);
    await expect(page.locator('.projects')).toContainText('פרויקט שהושלם לדוגמה');
    await page.goto('/projects/sample-5745');
    await shown(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('הקלטות תשמ״ה לדוגמה');
    await expect(page.locator('.figure.big')).toContainText('75%');
    await expect(page.getByRole('link', { name: 'כניסה כדי לקחת פריט' })).toBeVisible();
    await expect(page.getByText('מישהו עובד על זה').first()).toBeVisible();
  });

  test('signed in, a helper takes the next item and lets one go', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'it changes the stand-in API’s state: one is enough');
    await page.request.get('http://localhost:3002/_projects/reset');
    await signIn(page);
    await page.goto('/projects/sample-5745');
    await shown(page);
    await expect(page.getByText('שמור לכם')).toBeVisible();
    await page.getByRole('button', { name: 'שחרור' }).click();
    await expect.poll(async () => (await (await page.request.get('http://localhost:3002/_projects')).json()) as unknown[]).toEqual([{ slug: 'sample-5745', what: 'release', item: 'e1' }]);
    await page.getByRole('button', { name: 'תנו לי את הבא' }).click();
    await expect(page).toHaveURL(/\/events\/5745-05-14$|\/rh-aaaaaev4$/);
    const done = (await (await page.request.get('http://localhost:3002/_projects')).json()) as { what: string }[];
    expect(done.map((d) => d.what)).toEqual(['release', 'next']);
  });

  test('a project is not taken from another site', async ({ request }) => {
    // React Router refuses a post whose origin is another site before the action runs; the action's own check is the second line.
    const answer = await request.post('/projects/sample-5745', { headers: { origin: 'https://example.org', cookie: 'rh_session=sample' }, form: { intent: 'next' }, maxRedirects: 0 });
    if (answer.status() < 400) expect(await answer.text()).toContain('הבקשה לא נשלחה מהאתר עצמו');
    expect(answer.headers()['location']).toBeUndefined();
  });

  test('the API reference: every route, a group in full', async ({ page }) => {
    await page.goto('/developers/reference');
    await expect(page.locator('.doc h1')).toHaveText('API reference');
    await page.locator('a[href="/developers/reference/projects#claimNext"]').click();
    await expect(page).toHaveURL(/\/developers\/reference\/projects#claimNext$/);
    await expect(page.locator('#claimNext')).toContainText('Authorization: Bearer $CHASSIDUSHUB_TOKEN');
    await expect(page.locator('#claimNext')).toContainText('rh.claimNext(');
    await page.goto('/developers/reference/search');
    await expect(page.getByRole('link', { name: "Open this example's answer" })).toHaveAttribute('href', /^https:\/\/api\.chassidushub\.org\/v1\/search\?q=/);
  });
});
