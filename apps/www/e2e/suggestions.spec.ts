import { expect, test, type Page } from '@playwright/test';

// The suggestions come from the stand-in API (fixture-suggestions.ts).
test.skip(!!process.env.BASE_URL, 'the sample suggestions exist only on the local build');

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
const reset = (page: Page) => page.request.get('http://localhost:3002/_suggestions/reset');
const done = async (page: Page) => (await (await page.request.get('http://localhost:3002/_suggestions')).json()) as { id: number; what: string; body: Record<string, unknown> }[];

test('the list shows open suggestions with their numbers and authors, closed ones on their tab, and finds by words', async ({ page }) => {
  await page.goto('/suggestions');
  await expect(page.getByRole('link', { name: /תיקון מילה בשיחה לדוגמה/ })).toHaveAttribute('href', '/suggestions/42');
  await expect(page.getByRole('link', { name: /תיקון מילה בשיחה לדוגמה/ })).toContainText('#42');
  await expect(page.getByRole('link', { name: /תיקון מילה בשיחה לדוגמה/ })).toContainText('שולח לדוגמה');
  await expect(page.getByRole('link', { name: /תוספת הערה לדוגמה/ })).toBeVisible();
  await page.getByRole('button', { name: /סגורות/ }).click();
  await expect(page).toHaveURL(/state=closed/);
  await expect(page.getByRole('link', { name: /שם חדש לשיחה לדוגמה/ })).toContainText('אושרה ונכנסה לספרייה');
  await page.goto('/suggestions?q=תוספת');
  await expect(page.getByRole('link', { name: /תוספת הערה לדוגמה/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /תיקון מילה/ })).toHaveCount(0);
});

test('signed in, "ששלחתי" lists only the person’s own', async ({ page }) => {
  await signIn(page);
  await page.goto('/suggestions');
  await page.getByRole('button', { name: 'ששלחתי' }).click();
  await expect(page).toHaveURL(/author=sample-reader/);
  await expect(page.getByRole('link', { name: /תוספת הערה לדוגמה/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /תיקון מילה/ })).toHaveCount(0);
});

test('a suggestion reads as a conversation: its changes word by word, what was said, who is asked, what it fixes', async ({ page }) => {
  await page.goto('/suggestions/42');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('תיקון מילה בשיחה לדוגמה');
  const words = page.locator('.sg-entry .diff').first();
  await expect(words.locator('del')).toHaveText('שניה');
  await expect(words.locator('ins')).toHaveText('שנייה');
  await expect(page.locator('.sg-entry .sg-after').first()).toHaveText('שיחה ראשונה לדוגמה');
  await expect(page.getByRole('link', { name: '#44' })).toHaveAttribute('href', '/suggestions/44');
  await expect(page.getByText('בדקתי מול הדפוס, נראה נכון.')).toBeVisible();
  await expect(page.locator('.sg-answers').getByText('תודה!')).toBeVisible();
  await expect(page.getByText('התבקשה בדיקה משומר לדוגמה')).toBeVisible();
  await expect(page.getByText(/a date looks unusual/)).toBeVisible();
  await expect(page.getByRole('link', { name: '#40' })).toHaveAttribute('href', '/issues/40');
  await expect(page.getByRole('link', { name: 'להיכנס' })).toHaveAttribute('href', '/signin?return=%2Fsuggestions%2F42');
  await page.getByRole('button', { name: /השינויים/ }).click();
  await expect(page).toHaveURL(/tab=changes/);
  await expect(page.locator('.sg-entry')).toHaveCount(1);
});

test('a number that is an issue goes to the issue; a number nobody has is not found', async ({ page }) => {
  const issue = await page.request.get('/suggestions/45', { maxRedirects: 0 });
  expect(issue.status()).toBe(302);
  expect(issue.headers().location).toBe('/issues/45');
  expect((await page.request.get('/suggestions/99')).status()).toBe(404);
});

test('/review leads to what waits for review in the back room, an import included', async ({ page }) => {
  await page.goto('/review');
  await expect(page).toHaveURL(/\/back\?tab=waiting$/);
  await expect(page.getByRole('link', { name: /תיקון מילה בשיחה לדוגמה/ })).toContainText('1 השתנו באתר מאז');
  await page.getByRole('link', { name: /ייבוא לדוגמה/ }).click();
  await expect(page).toHaveURL(/\/suggestions\/i404$/);
  await expect(page.getByText('להצעה שיובאה אין שיחה')).toBeVisible();
  await expect(page.locator('.sg-after').first()).toHaveText('5732');
});

test('a keeper decides each clash, then approves with a note', async ({ page }, info) => {
  // It changes the stand-in API's state, which the phone and the desktop share: one of them is enough.
  test.skip(info.project.name !== 'desktop', 'one approval is enough');
  await reset(page);
  await signIn(page);
  await page.goto('/suggestions/42');
  const approve = page.getByRole('button', { name: 'לאשר ולהכניס' });
  await expect(page.getByText('מחכה להחלטה על התנגשויות')).toBeVisible();
  await expect(approve).toBeDisabled();
  await page.getByRole('radio', { name: 'מה שבאתר' }).check();
  await expect(page.getByText('מוכנה להיכנס')).toBeVisible();
  await page.getByLabel('הערה למציע (לא חובה כשמאשרים)').fill('תודה, נכון לפי הדפוס.');
  await approve.click();
  await expect(page.getByText('אישרתם, והשינוי נכנס לספרייה.')).toBeVisible();
  await expect(page.locator('.sg-state')).toHaveText('אושרה ונכנסה לספרייה');
  const [review] = (await done(page)).filter((d) => d.what === 'POST reviews');
  expect(review?.body).toMatchObject({ verdict: 'approve', body: 'תודה, נכון לפי הדפוס.', resolutions: { 'rh-aaaaaab1': { '/label': { take: 'ours' } } } });
  await reset(page);
});

test('a comment on one change goes to the conversation, about that item', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one comment is enough');
  await reset(page);
  await signIn(page);
  await page.goto('/suggestions/42?tab=changes');
  await page.getByRole('button', { name: 'הערה כאן' }).click();
  await page.getByLabel('הערה על השינוי הזה').fill('המילה נכונה.');
  await page.getByRole('button', { name: 'לשלוח עכשיו' }).click();
  await page.getByRole('button', { name: /שיחה/ }).click();
  await expect(page.getByText('המילה נכונה.')).toBeVisible();
  await expect(page.getByText('על שיחה ראשונה לדוגמה')).toBeVisible();
  const [comment] = (await done(page)).filter((d) => d.what === 'POST comments');
  expect(comment?.body).toMatchObject({ body: 'המילה נכונה.', anchor: { entity: 'rh-aaaaaab1', field: '/body/versions/he/segments/p2/text' } });
  await reset(page);
});

test('its author closes a suggestion and opens it again; another site cannot', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  await reset(page);
  await signIn(page);
  await page.goto('/suggestions/44');
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'לסגור את ההצעה' }).click();
  await expect(page.locator('.sg-state')).toHaveText('נסגרה');
  await page.getByRole('button', { name: 'לפתוח מחדש' }).click();
  await expect(page.locator('.sg-state')).toHaveText('ממתינה לבדיקה');
  const refused = await page.request.post('/_/suggestions/403/withdraw', { headers: { origin: 'https://elsewhere.example' }, data: {} });
  expect(refused.status()).toBe(403);
  await reset(page);
});
