import { expect, test, type Page } from '@playwright/test';

// Reports, the inbox and people come from the stand-in API (fixture-people.ts).
test.skip(!!process.env.BASE_URL, 'the sample reports exist only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
/** Tests that change the sample reports run on one device only, so the two never change them at once. */
const changesReports = () => test.skip(test.info().project.name !== 'desktop', 'changes the shared sample reports');

test('the list shows the open public reports, and filters by state and label without script', async ({ page }) => {
  await page.goto('/issues');
  const list = page.getByRole('list', { name: 'דיווחים' });
  await expect(list.getByRole('link', { name: /מילה שגויה בפסקה הראשונה/ })).toHaveAttribute('href', '/issues/12');
  await expect(list.getByText('בקשה פרטית לדוגמה')).toHaveCount(0);
  await expect(list.getByText('עמוד חסר לדוגמה')).toHaveCount(0);
  await page.getByRole('link', { name: /טופלו/ }).click();
  await expect(page).toHaveURL('/issues?state=closed');
  await expect(list.getByText('עמוד חסר לדוגמה')).toBeVisible();

  await page.goto('/issues?label=text');
  await expect(list.getByText('מילה שגויה בפסקה הראשונה לדוגמה')).toBeVisible();
  await page.goto('/issues?type=rights');
  await expect(page.getByText('אין כאן דיווחים.')).toBeVisible();
});

test('signed in, the list also shows the private reports the reader may see', async ({ page }) => {
  await signIn(page);
  await page.goto('/issues');
  await expect(page.getByText('בקשה פרטית לדוגמה')).toBeVisible();
  await expect(page.getByRole('link', { name: 'שפתחתי' })).toBeVisible();
});

test('a report shows its words with links, its labels and its conversation; signed out, it asks to sign in', async ({ page }) => {
  await page.goto('/issues/12');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('מילה שגויה בפסקה הראשונה לדוגמה');
  await expect(page.getByText('מכונה', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'שיחה ראשונה' })).toHaveAttribute('href', '/sample/1/1');
  await expect(page.getByRole('link', { name: '#11' })).toHaveAttribute('href', '/issues/11');
  await expect(page.getByRole('link', { name: '@sample-keeper' })).toHaveAttribute('href', '/u/sample-keeper');
  await expect(page.getByText('תודה, אבדוק לדוגמה.')).toBeVisible();
  await expect(page.getByText('הוסיף תווית טקסט')).toBeVisible();
  await expect(page.getByRole('link', { name: 'להיכנס' })).toHaveAttribute('href', '/signin?return=%2Fissues%2F12');
});

test('a private report is not found to a reader who is not signed in, and opens to one who may read it', async ({ page }) => {
  const response = await page.goto('/issues/13');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('אין דיווח גלוי במספר הזה')).toBeVisible();
  await signIn(page);
  await page.goto('/issues/13');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('בקשה פרטית לדוגמה');
});

test("a suggestion's number goes on to the suggestion", async ({ request }) => {
  const response = await request.get('/issues/50', { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toBe('/suggestions/50');
});

test('signed in, a keeper comments, closes the report as fixed and opens it again, and takes it on', async ({ page }) => {
  changesReports();
  await page.request.get('http://localhost:3002/_people_reset');
  await signIn(page);
  await page.goto('/issues/14');
  await page.getByLabel('מה לכתוב').fill('תגובה חדשה לדוגמה');
  await page.getByRole('button', { name: 'תגובה', exact: true }).click();
  await expect(page.getByText('תגובה חדשה לדוגמה')).toBeVisible();

  await page.getByRole('button', { name: 'סגירה כטופל' }).click();
  await expect(page.locator('.pmeta .tag.strong')).toHaveText('טופל');
  await expect(page.getByText('סגר כטופל')).toBeVisible();
  await page.getByRole('button', { name: 'פתיחה מחדש' }).click();
  await expect(page.locator('.pmeta .tag.strong')).toHaveText('פתוח');

  await page.getByRole('button', { name: 'לקחת על עצמי' }).click();
  await expect(page.getByRole('button', { name: 'הסרה ממני' })).toBeVisible();

  await page.getByRole('button', { name: 'שינוי' }).click();
  const sheet = page.getByRole('dialog', { name: 'תוויות' });
  await sheet.getByRole('button', { name: 'סריקה' }).click();
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('.facts').getByRole('link', { name: 'סריקה' })).toBeVisible();
  await page.request.get('http://localhost:3002/_people_reset');
});

test('signed in, a new report about an item opens as the reader and goes to its page', async ({ page }) => {
  changesReports();
  await signIn(page);
  await page.goto('/issues/new?item=rh-aaaaaab1');
  await expect(page.getByRole('link', { name: 'שיחה ראשונה' })).toBeVisible();
  await expect(page.getByRole('link', { name: /מילה שגויה בפסקה הראשונה/ })).toBeVisible();
  await page.getByLabel('טעות בטקסט').check();
  await expect(page.getByLabel('פרטים')).toHaveValue(/מה כתוב\?/);
  await page.getByLabel('כותרת: במשפט אחד, מה לא בסדר').fill('דיווח חדש לדוגמה');
  await page.getByRole('button', { name: 'שליחת הדיווח' }).click();
  await expect(page).toHaveURL(/\/issues\/\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('דיווח חדש לדוגמה');
  await page.request.get('http://localhost:3002/_people_reset');
});

test('without an account a report is sent too, and a captcha the site cannot give asks to sign in', async ({ page }) => {
  await page.goto('/issues/new');
  await page.getByLabel('עמוד חסר').check();
  await page.getByLabel('כותרת: במשפט אחד, מה לא בסדר').fill(`דיווח של אורח ${test.info().project.name}`);
  await page.getByRole('button', { name: 'שליחת הדיווח' }).click();
  await expect(page.getByText('הדיווח התקבל')).toBeVisible();
  const reports = (await (await page.request.get('http://localhost:3002/_reports')).json()) as { title: string; reason: string }[];
  expect(reports).toContainEqual(expect.objectContaining({ title: `דיווח של אורח ${test.info().project.name}`, reason: 'missing-page' }));

  await page.goto('/issues/new');
  await page.getByLabel('עמוד חסר').check();
  await page.getByLabel('כותרת: במשפט אחד, מה לא בסדר').fill('captcha לדוגמה');
  await page.getByRole('button', { name: 'שליחת הדיווח' }).click();
  await expect(page.getByRole('alert')).toContainText('אפשר להיכנס ולדווח');
  await expect(page.getByRole('alert').getByRole('link', { name: 'כניסה' })).toHaveAttribute('href', '/signin?return=%2Fissues%2Fnew');
});

test('the inbox asks to sign in, and signed in shows the lines and marks them read', async ({ page }) => {
  await page.goto('/inbox');
  await expect(page.getByRole('link', { name: 'כניסה' }).last()).toHaveAttribute('href', '/signin?return=%2Finbox');
  changesReports();
  await page.request.get('http://localhost:3002/_people_reset');
  await signIn(page);
  await page.goto('/inbox');
  const list = page.getByRole('list', { name: 'התיבה' });
  await expect(list.getByRole('link', { name: /מילה שגויה/ })).toHaveAttribute('href', '/issues/12');
  await expect(list.getByRole('link', { name: /הצעה לדוגמה/ })).toHaveAttribute('href', '/suggestions/50');
  await list.getByRole('button', { name: 'סימון כנקרא' }).first().click();
  await expect(list.getByRole('link')).toHaveCount(1);
  await page.getByRole('button', { name: 'הכול', exact: true }).click();
  await expect(page).toHaveURL('/inbox?filter=all');
  await expect(list.getByRole('link')).toHaveCount(2);
  await page.getByRole('button', { name: 'סימון הכול כנקרא' }).click();
  await page.getByRole('button', { name: 'שלא נקראו' }).click();
  await expect(page.getByText('אין כאן שום דבר חדש.')).toBeVisible();
  await page.request.get('http://localhost:3002/_people_reset');
});

test("a person's page shows who they are and what they did; an old handle leads to the new one", async ({ page, request }) => {
  await page.goto('/u/sample-reader');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('קורא לדוגמה');
  await expect(page.getByRole('link', { name: /3\s*תיקונים שאושרו/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /הצעה לדוגמה/ })).toHaveAttribute('href', '/suggestions/50');
  await expect(page.getByRole('link', { name: 'החשבון שלי', exact: true })).toHaveCount(0);
  const moved = await request.get('/u/old-reader', { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toBe('/u/sample-reader');
  expect((await request.get('/u/nobody-here')).status()).toBe(404);
});

test("the reader app's links land on the item's page, or on a new report about it", async ({ request }) => {
  const where = async (path: string) => (await request.get(path, { maxRedirects: 0 })).headers().location;
  expect(await where('/_/app/edit?work=w&unit=u')).toBe('/sample/1/1');
  expect(await where('/_/app/report?farbrengen=1')).toBe('/issues/new?item=rh-aaaaaab1');
  expect(await where('/_/app/report?farbrengen=999')).toBe('/issues/new');
  expect((await request.get('/_/app/other', { maxRedirects: 0 })).status()).toBe(404);
});

test('signed in, the account sheet leads to the inbox and the reader’s own page', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'החשבון שלי' }).filter({ visible: true }).first().click();
  const sheet = page.getByRole('dialog', { name: 'החשבון שלי' });
  await expect(sheet.getByRole('link', { name: 'התיבה שלי' })).toHaveAttribute('href', '/inbox');
  await expect(sheet.getByRole('link', { name: 'הדף שלי' })).toHaveAttribute('href', '/u/sample-reader');
});
