import { expect, test, type Page } from '@playwright/test';

// The steward, the tree, the people and the files come from the stand-in API (fixture-stewards.ts).
test.skip(!!process.env.BASE_URL, 'the sample steward exists only on the local build');

const API = 'http://localhost:3002';
const as = (page: Page, who: 'steward' | 'sample') => page.context().addCookies([{ name: 'rh_session', value: who, url: 'http://localhost:3001' }]);
const sent = async (page: Page) => (await (await page.request.get(`${API}/_stewards`)).json()).sent as { path: string; query: string; type: string | null; bytes: number; body: unknown }[];
/** These change the stand-in's state, which the phone and the desktop share: the desktop is enough. */
const once = (info: { project: { name: string } }) => test.skip(info.project.name !== 'desktop', 'one run is enough');

test.describe('organizing the catalog', () => {
  test('signed out, the tree shows and sending asks to sign in', async ({ page }) => {
    await page.goto('/organize');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('סידור הקטלוג');
    await expect(page.getByText('ספרי חסידות לדוגמה')).toBeVisible();
    await expect(page.getByText('כדי לסדר את הקטלוג צריך להיכנס.')).toBeVisible();
  });

  test('a steward puts a sefer first, sees the change, sends it and puts it in', async ({ page }, info) => {
    once(info);
    await page.request.get(`${API}/_stewards/reset`);
    await as(page, 'steward');
    await page.goto('/organize?root=rh-org0a1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('סידור: ספרי חסידות לדוגמה');
    await page.getByRole('button', { name: 'למעלה ברשימה: ספר ב׳ לדוגמה' }).click();
    const changes = page.locator('.orgplan li');
    await expect(changes).toHaveCount(1);
    await page.getByRole('button', { name: 'לראות מה ישתנה' }).click();
    await expect(page.locator('.orgpreview')).toContainText('שיחות לדוגמה');
    await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
    await expect(page.getByText('ההצעה נשלחה לבדיקה.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'להצעה #61' })).toHaveAttribute('href', '/suggestions/61');
    await page.getByRole('button', { name: 'לאשר ולהכניס עכשיו' }).click();
    await expect(page.getByText('השינויים נכנסו לקטלוג.')).toBeVisible();
    const [made, approved] = await sent(page);
    expect(made!.body).toEqual({ operations: [{ op: 'reorder', items: ['rh-org0c2', 'rh-org0c1'], parent: 'rh-org0a1' }] });
    expect(approved!.path).toBe('/v1/suggestions/310/approve');
  });

  test('picking a row and renaming it adds the rename to the changes', async ({ page }) => {
    await as(page, 'steward');
    await page.goto('/organize');
    await page.getByRole('checkbox', { name: /שיחות לדוגמה/ }).check();
    await expect(page.locator('.orgbar .count')).toContainText('1');
    await page.getByRole('button', { name: 'שינוי שם' }).click();
    const sheet = page.getByRole('dialog', { name: 'שינוי שם' });
    await sheet.getByLabel('שם בעברית').fill('שיחות לדוגמה, מסודרות');
    await sheet.getByRole('button', { name: 'הוספה לשינויים' }).click();
    await expect(page.locator('.orgplan li')).toContainText('שיחות לדוגמה, מסודרות');
  });
});

test.describe('the stewards’ tools', () => {
  test('signed out they ask to sign in; a reader who is not a steward is told so', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('main').getByRole('link', { name: 'כניסה' })).toBeVisible();
    await as(page, 'sample');
    await page.reload();
    await expect(page.getByText('רק שומרי האתר רואים את הדף הזה.')).toBeVisible();
  });

  test('a steward suspends a reader, closes a report and takes a file down', async ({ page }, info) => {
    once(info);
    await page.request.get(`${API}/_stewards/reset`);
    await as(page, 'steward');
    await page.goto('/admin');
    const reader = page.locator('.row.stew', { hasText: 'קורא לדוגמה' });
    await reader.getByRole('button', { name: 'השעיה' }).click();
    await expect(reader.getByText('החשבון ייעצר')).toBeVisible();
    await reader.getByRole('button', { name: 'השעיה' }).click();
    await expect(reader.locator('.tag', { hasText: 'מושעה' })).toBeVisible();
    await expect(reader.getByRole('button', { name: 'החזרה' })).toBeVisible();

    await page.getByRole('button', { name: 'דיווחים' }).click();
    await expect(page).toHaveURL(/tab=reports/);
    await expect(page.getByText('טעות בטקסט')).toBeVisible();
    await page.getByRole('button', { name: 'טופל' }).click();
    await expect(page.getByText('אין דיווחים פתוחים.')).toBeVisible();

    await page.getByRole('button', { name: 'בקשות הסרה' }).click();
    await expect(page.getByText('בעל זכויות לדוגמה')).toBeVisible();
    await page.getByRole('button', { name: 'הסרת הקובץ' }).click();
    await page.getByRole('button', { name: 'הסרת הקובץ' }).click();
    await expect(page.getByText('הוסר', { exact: true })).toBeVisible();
    const paths = (await sent(page)).map((s) => s.path);
    expect(paths).toEqual(['/v1/reports/51/close', `/v1/admin/files/${'ab'.repeat(32)}/takedown`]);
  });

  test('the pass-through carries only the stewards’ addresses, and is never kept', async ({ page }) => {
    await as(page, 'steward');
    const people = await page.request.get('/_/steward/admin/people');
    expect(people.status()).toBe(200);
    expect(people.headers()['cache-control']).toMatch(/no-store/);
    expect((await page.request.get('/_/steward/admin/anything')).status()).toBe(404);
    const elsewhere = await page.request.post('/_/steward/reports/51/close', { headers: { origin: 'https://elsewhere.example' }, data: { outcome: 'resolved' } });
    expect(elsewhere.status()).toBe(403);
  });
});

test('the account sheet leads a steward to organizing and the tools, and nobody else', async ({ page }) => {
  const open = async () => {
    await page.getByRole('button', { name: 'החשבון שלי' }).filter({ visible: true }).first().click();
    return page.getByRole('dialog', { name: 'החשבון שלי' });
  };
  await as(page, 'sample');
  await page.goto('/about');
  let sheet = await open();
  await expect(sheet.getByRole('link', { name: 'התיקונים שלי' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'כלי השומרים' })).toHaveCount(0);
  await as(page, 'steward');
  await page.reload();
  sheet = await open();
  await expect(sheet.getByRole('link', { name: 'סידור הקטלוג' })).toHaveAttribute('href', '/organize');
  await sheet.getByRole('link', { name: 'כלי השומרים' }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test.describe('adding what is missing', () => {
  test('the about page leads to it, and signed out it asks to sign in', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('link', { name: /הוספת חומר חסר/ }).click();
    await expect(page).toHaveURL(/\/add$/);
    await expect(page.getByRole('main').getByRole('link', { name: 'כניסה' })).toBeVisible();
  });

  test('a file: the machine proposes the farbrengen, the person confirms and sends it', async ({ page }, info) => {
    once(info);
    await page.request.get(`${API}/_stewards/reset`);
    await as(page, 'steward');
    await page.goto('/add');
    const pdf = Buffer.from('%PDF-1.4 sample file for the tests');
    await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name: 'hanacha_sample.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.locator('.drop')).toContainText('hanacha_sample.pdf');
    await page.getByRole('button', { name: 'המשך: לאן זה שייך' }).click();
    await expect(page.locator('.proposal .machine')).toHaveText('הצעת מכונה');
    await expect(page.getByRole('radio', { name: /התוועדות לדוגמה/ })).toBeChecked();
    await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
    await expect(page.getByText('נשלח לבדיקה (הצעה #77)')).toBeVisible();
    const [upload] = await sent(page);
    expect(upload!.path).toBe('/v1/uploads');
    expect(upload!.bytes).toBe(pdf.length);
    expect(upload!.type).toBe('application/pdf');
    const query = new URLSearchParams(upload!.query);
    expect(Object.fromEntries(query)).toMatchObject({ what: 'hanacha', for: 'rh-3dvjfkyc', kind: 'bilti-mugah', rights: 'mine', title: 'hanacha sample' });
  });

  test('a hanacha’s words go as text, to a farbrengen the catalog does not have yet', async ({ page }, info) => {
    once(info);
    await page.request.get(`${API}/_stewards/reset`);
    await as(page, 'steward');
    await page.goto('/add');
    await page.getByRole('button', { name: 'טקסט' }).click();
    await page.getByLabel('הטקסט (שורה ריקה בין פסקאות)').fill('פסקה לדוגמה.\n\nועוד פסקה לדוגמה.');
    await page.getByRole('button', { name: 'המשך: לאן זה שייך' }).click();
    await page.getByRole('radio', { name: 'התוועדות שאין עדיין באתר' }).check();
    await page.getByLabel('שם ההתוועדות').fill('התוועדות חדשה לדוגמה');
    await page.getByRole('button', { name: 'שליחה לבדיקה' }).click();
    await expect(page.getByText('נשלח לבדיקה (הצעה #78)')).toBeVisible();
    const [text] = await sent(page);
    expect(text!.body).toMatchObject({ eventTitle: 'התוועדות חדשה לדוגמה', eventDate: '5732-11-20', rights: 'mine' });
  });
});

test('what is new lists the farbrengens of Kislev, each to play', async ({ page }) => {
  await page.goto('/new');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('מה חדש');
  const kislev = page.getByRole('region', { name: 'התוועדויות כסלו' });
  await expect(kislev.getByRole('heading', { name: 'תשמ״ז' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'התוועדויות חשוון' })).toContainText('אין עדיין הקלטות מהחודש הזה.');
  await expect(page.locator('.machine').first()).toBeVisible();
});

test.describe('showcases', () => {
  test('only the platform’s admin makes them', async ({ page }) => {
    await page.goto('/showcase');
    await expect(page.getByText('רק מנהל האתר יוצר דפי תצוגה.')).toBeVisible();
    expect((await page.request.get('/_/showcases')).status()).toBe(403);
    await as(page, 'steward');
    const elsewhere = await page.request.post('/_/showcases', { headers: { origin: 'https://elsewhere.example' }, data: { intent: 'save' } });
    expect(elsewhere.status()).toBe(403);
  });

  test('the admin makes one; its guest hears, reads the words, and nothing else is given', async ({ page }) => {
    await as(page, 'steward');
    await page.goto('/showcase');
    await expect(page.getByRole('heading', { name: 'דף חדש' })).toBeVisible();
    // The farbrengen whose words were checked most is picked already.
    await expect(page.locator('.row.stew', { hasText: 'התוועדות לדוגמה' })).toBeVisible();
    await page.getByLabel('חיפוש התוועדות או שיחה (שם, תאריך, חלק)').fill('שיחה ראשונה');
    await page.locator('.row', { hasText: 'שיחה ראשונה' }).getByRole('button', { name: 'הוספה' }).click();
    await expect(page.locator('.row.stew', { hasText: 'שיחה ראשונה' })).toBeVisible();
    await page.getByRole('textbox', { name: 'כותרת', exact: true }).fill('תצוגה לדוגמה');
    await page.getByRole('button', { name: 'שמירה וקבלת קישור' }).click();
    const link = page.getByRole('link', { name: /\/show\/[a-z2-7]{20}$/ });
    await expect(link).toBeVisible();
    const address = (await link.getAttribute('href'))!;
    const token = address.split('/').pop()!;

    const guest = await page.context().browser()!.newContext();
    const view = await guest.newPage();
    const response = await view.goto(`http://localhost:3001${address}`);
    expect(response?.headers()['cache-control']).toBe('private, no-store');
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('תצוגה לדוגמה');
    await view.getByRole('button', { name: 'המילים' }).click();
    await expect(view.getByText('פסקה ראשונה לדוגמה, שנשמעה בהקלטה.')).toBeVisible();
    await expect(view.locator('.showwords .machine')).toBeVisible();
    await expect(view.getByRole('link', { name: 'שיחה ראשונה' }).first()).toHaveAttribute('href', '/sample/1/1');

    const media = await view.request.get(`http://localhost:3001/show/${token}/m/0`, { maxRedirects: 0 });
    expect(media.status()).toBe(302);
    expect(media.headers().location).toBe(`${API}/objects/${'ab'.repeat(32)}`);
    expect((await view.request.get(`http://localhost:3001/show/${token}/m/9`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await view.request.get(`http://localhost:3001/show/${token}/t/rh-aaaaaar2`)).status()).toBe(404);
    expect((await view.request.get('http://localhost:3001/show/abcdefghijklmnopqrst')).status()).toBe(404);
    await guest.close();

    // Removing it closes its address at once.
    await page.getByRole('button', { name: 'מחיקת הדף' }).click();
    await page.getByRole('button', { name: 'מחיקה', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'דף חדש' })).toBeVisible();
    expect((await page.request.get(`/show/${token}`)).status()).toBe(404);
  });
});
