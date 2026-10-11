import { expect, test, type Page } from '@playwright/test';

/**
 * An item's tools on the stand-in API (fixture-item-tools.ts): its history
 * and talk page from the reader's corner menu, a restore and a comment sent
 * as the person, printings compared, a scan's text with machine lines
 * labelled, a shaar checked before it is sent, a file's page, the subject
 * index, the embed other sites frame, and the old addresses that redirect.
 */
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
const sentToApi = async (page: Page) => (await (await page.request.get('http://localhost:3002/_tools')).json()) as Array<{ path: string; body: Record<string, unknown> }>;

test('history and talk are in the reader corner menu', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: 'היסטוריה' }).click();
  await expect(page).toHaveURL(/\/history\/rh-aaaaaab1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('היסטוריה');
  // The path bar's last level moves between the item's pages.
  await page.getByRole('navigation', { name: 'המקום באתר' }).getByRole('button', { name: /היסטוריה/ }).click();
  await page.getByRole('menuitemradio', { name: 'שיחה' }).click();
  await expect(page).toHaveURL(/\/talk\/rh-aaaaaab1$/);
});

test('history shows each version and its change, compares two, and sends a restore', async ({ page }) => {
  await signIn(page);
  await page.goto('/history/rh-aaaaaab1');
  await page.waitForLoadState('networkidle');
  // The latest change, open: the word that changed marked on both sides.
  await expect(page.locator('#v3 del')).toHaveText('לדוגמא');
  await expect(page.locator('#v3 ins')).toHaveText('לדוגמה');
  await expect(page.getByText('הדף נוצר.')).toBeVisible();

  await page.locator('#v3').getByRole('button', { name: 'להשוות' }).click();
  await page.locator('#v2').getByRole('button', { name: 'להשוות' }).click();
  const compared = page.getByRole('region', { name: /^מ־/ });
  await expect(compared.locator('ins')).toHaveText('לדוגמה');

  await page.locator('#v2').getByRole('button', { name: 'להחזיר את הגרסה הזאת' }).click();
  await expect(page.locator('#v2').getByRole('status')).toContainText('נשלח לבדיקה');
  expect((await sentToApi(page)).at(-1)).toEqual({ path: '/v1/entities/rh-aaaaaab1/restore', body: { rev: 2 } });
});

test('talk shows topics with their answers, and a signed-in reader writes one', async ({ page }) => {
  await page.goto('/talk/rh-aaaaaab1');
  await expect(page.getByRole('link', { name: '#12' })).toHaveAttribute('href', '/suggestions/12');
  await expect(page.getByRole('link', { name: 'rh-aaaaaab2' })).toHaveAttribute('href', '/rh-aaaaaab2');
  await expect(page.getByText('תשובה לדוגמה.')).toBeVisible();
  await expect(page.getByText('כדי לכתוב כאן צריך')).toBeVisible();

  await signIn(page);
  await page.reload();
  await page.getByLabel('מה רציתם לומר?').fill('נושא חדש לדוגמה');
  await page.getByRole('button', { name: 'לפרסם' }).click();
  // Both test projects write to the one stand-in, so the topic may be there twice.
  await expect(page.getByText('נושא חדש לדוגמה').first()).toBeVisible();
  expect((await sentToApi(page)).at(-1)!.body).toEqual({ body: 'נושא חדש לדוגמה' });
});

test('printings are compared word by word, and the machine text is labelled', async ({ page }) => {
  await page.goto('/compare/rh-aaaaaab1');
  await expect(page.locator('.it-passages del')).toHaveText('לדוגמא');
  await expect(page.locator('.it-passages ins')).toHaveText('לדוגמה');
  // The scan was read by a machine: said so beside the comparison.
  await expect(page.getByText(/נקראו במכונה ועוד לא נבדקו/)).toBeVisible();
  await page.getByRole('group', { name: 'הדפוס השלישי לדוגמה' }).getByRole('link', { name: 'שני' }).click();
  await expect(page).toHaveURL(/b=text%3Arh-aaaaaab9/);
  await expect(page.getByText(/נקראו במכונה ועוד לא נבדקו/)).toHaveCount(0);
});

test("a scan's text: machine lines labelled, a line fixed and the page confirmed", async ({ page }) => {
  await signIn(page);
  await page.goto('/text/rh-aaaaaat1');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('שורה אחת נקראה במכונה ועוד לא נבדקה בידי אדם')).toBeVisible();
  await expect(page.locator('.it-line.l0 .machine')).toHaveText('מכונה');
  await page.getByRole('button', { name: 'לתקן את שורה 3' }).click();
  await page.getByLabel('שורה 3').fill('שורה מתוקנת לדוגמה');
  await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
  await expect(page.getByText('נשלח לבדיקה')).toBeVisible();
  expect((await sentToApi(page)).at(-1)).toEqual({ path: '/v1/scans/rh-aaaaaat1/text/fix', body: { page: 1, line: '1-3', text: 'שורה מתוקנת לדוגמה' } });
  await page.getByRole('button', { name: 'העמוד הזה נכון' }).click();
  await expect(page.getByText('העמוד יעלה דרגה')).toBeVisible();

  // The strip goes to another page; a page not read yet says so.
  await page.getByRole('navigation', { name: 'הגהה לפי עמודים' }).getByRole('link', { name: '3' }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect(page.getByText('את העמוד הזה עוד לא קראו')).toBeVisible();
});

test('a shaar is read before it is sent: a line the catalog cannot read is named', async ({ page }) => {
  await signIn(page);
  await page.goto('/shaar/rh-aaaaaaw9');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.machine')).toContainText('השער הזה נעשה מנתוני הקטלוג');
  await page.getByRole('button', { name: 'עריכה' }).click();
  const box = page.getByLabel('השער', { exact: true });
  await box.fill(`${await box.inputValue()}\n# כותרת שגויה\n`);
  await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
  await expect(page.getByRole('alert')).toContainText('כותרת של פרק');
  await box.fill((await box.inputValue()).replace('# כותרת שגויה\n', ''));
  await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
  await expect(page.getByText('נשלח לבדיקה')).toBeVisible();
  expect((await sentToApi(page)).at(-1)!.path).toBe('/v1/suggestions/shaar');
});

test("a file's page says what it is, who uses it, and labels what a machine made", async ({ page }) => {
  await page.goto(`/files/${'5'.repeat(64)}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('קובץ PDF');
  await expect(page.getByRole('link', { name: /דפוס לדוגמה|rh-aaaaaat1/ })).toBeVisible();
  await expect(page.getByText('מכונה הכינה את אלה')).toBeVisible();
  expect((await page.goto('/files/not-a-file'))?.status()).toBe(404);
});

test('the subject index: letters, references, machine-read ones marked, and search', async ({ page }) => {
  await page.goto('/mafteach');
  await expect(page.getByRole('link', { name: 'ח״ב 412' })).toHaveAttribute('href', '/sample/1/1');
  await expect(page.locator('.it-ref.mach')).toHaveText('חט״ו 30');
  await page.getByRole('searchbox', { name: 'חיפוש במפתח' }).fill('אמונה');
  await page.getByRole('searchbox', { name: 'חיפוש במפתח' }).press('Enter');
  await expect(page.getByText('נמצאו 1 נושאים')).toBeVisible();
});

test('the embed may be framed by any site, and no other page may', async ({ page }) => {
  const embed = await page.goto('/embed/rh-3dvjfkyc');
  expect(embed?.headers()['content-security-policy']).toBe('frame-ancestors *');
  expect(embed?.headers()['x-frame-options']).toBeUndefined();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('התוועדות לדוגמה');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: /שיחה א׳/ }).click();
  await expect(page.locator('.mini')).toBeVisible();
  await expect(page.getByRole('link', { name: /לפתוח ב־ChassidusHub/ })).toHaveAttribute('href', /\/listen\/5732\/rh-3dvjfkyc$/);

  const other = await page.goto('/history/rh-aaaaaab1');
  expect(other?.headers()['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(other?.headers()['x-frame-options']).toBe('SAMEORIGIN');
});

test('the old /edit and /all addresses go to the item itself', async ({ page }) => {
  const edit = await page.request.get('/edit/rh-aaaaaab1', { maxRedirects: 0 });
  expect(edit.status()).toBe(301);
  expect(edit.headers().location).toBe('/rh-aaaaaab1?edit');
  const all = await page.request.get('/all/rh-aaaaaab1', { maxRedirects: 0 });
  expect(all.status()).toBe(301);
  expect(all.headers().location).toBe('/rh-aaaaaab1');
});
