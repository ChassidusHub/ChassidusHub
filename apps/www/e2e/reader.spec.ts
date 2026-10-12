import { expect, test } from '@playwright/test';

// The reading pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

test('draws the words once, on the server, and keeps them through hydration', async ({ page }) => {
  const response = await page.goto('/sample/1/1');
  const html = (await response?.text()) ?? '';
  // The words are in the page once: not again in the data the browser hydrates from.
  expect(html.split('פסקה ראשונה לדוגמה').length - 1).toBe(1);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.torah p')).toHaveCount(4);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('שיחה ראשונה');
  // The print's own heading repeats the title, so it is not shown twice.
  await expect(page.locator('.torah .hd.first')).toBeHidden();
});

test('opens a footnote in a sheet, and steps to the next one', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'הערה 1' }).click();
  const sheet = page.getByRole('dialog', { name: 'הערה 1' });
  await expect(sheet).toContainText('הערה ראשונה לדוגמה.');
  await sheet.getByRole('button', { name: 'הערה 2' }).click();
  await expect(page.getByRole('dialog', { name: 'הערה 2' })).toContainText('הערה שניה לדוגמה.');
});

test('goes to the next sicha and back, with its words', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /שיחה שניה/ }).last().click();
  await expect(page).toHaveURL(/\/sample\/1\/2$/);
  await expect(page.locator('.torah p')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('.torah p')).toHaveCount(4);
});

test('labels words a machine read', async ({ page }) => {
  await page.goto('/sample/1/2');
  await expect(page.getByText('נקרא במכונה, עוד לא נבדק בידי אדם')).toBeVisible();
  await expect(page.locator('.torah.unchecked')).toHaveCount(1);
});

test('keeps the text size the reader picks', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  const size = () => page.locator('.torah').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await page.getByRole('button', { name: 'גודל ומראה' }).click();
  await page.getByRole('button', { name: 'גדול יותר' }).click();
  expect(await size()).toBe(before + 2);
  await page.reload();
  expect(await size()).toBe(before + 2);
});

test('the corner menu switches versions', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: /נוסח/ }).click();
  await expect(page.getByRole('dialog', { name: 'נוסח' }).getByRole('link', { name: 'אנגלית' })).toBeVisible();
});

test('a page with nothing to show yet says so', async ({ page }) => {
  await page.goto('/sample/1/3');
  await expect(page.getByText('אין עדיין טקסט או סריקה לדף הזה.')).toBeVisible();
});

test('a broken % escape is a 404', async ({ page }) => {
  const response = await page.goto('/sample/%E0%A4%A');
  expect(response?.status()).toBe(404);
});

test('an unknown path is a 404', async ({ page }) => {
  const response = await page.goto('/sample/9/9');
  expect(response?.status()).toBe(404);
});

test('remembers the page for Home’s "continue learning"', async ({ page, context }) => {
  await page.goto('/sample/1/2');
  await page.waitForLoadState('networkidle');
  const cookie = (await context.cookies()).find((c) => c.name === 'ch_read');
  expect(JSON.parse(decodeURIComponent(cookie?.value ?? '{}'))).toEqual({ to: '/sample/1/2', title: 'שיחה שניה', sub: 'ספר לדוגמה · חלק א׳' });
});

test('a page with no words shows its PDF', async ({ page }) => {
  await page.route('https://drive.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>PDF</p>' }));
  await page.goto('/sample/1/4');
  await expect(page.locator('iframe.scan-frame')).toHaveAttribute('src', 'https://drive.google.com/file/d/sample-printed/preview');
  await expect(page.getByRole('link', { name: 'לפתוח בחלון חדש' })).toHaveAttribute('href', 'https://drive.google.com/file/d/sample-printed/view');
  await expect(page.getByRole('link', { name: 'תרגום לדוגמה' })).toBeVisible();
  await expect(page.getByText('אין עדיין טקסט או סריקה')).toHaveCount(0);
});

test('the corner menu opens the scan and lists the recordings', async ({ page, context }) => {
  await context.route('https://files.example.org/**', (route) => route.fulfill({ contentType: 'text/plain', body: 'PDF' }));
  await page.goto('/sample/1/1');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: /הסריקה/ }).click();
  expect((await popup).url()).toBe('https://files.example.org/sample.pdf#page=7');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: /לשמוע את הרבי/ }).click();
  await expect(page.getByRole('link', { name: /הקלטה ראשונה/ })).toHaveAttribute('href', '/rh-aaaaaar1');
  await expect(page.getByRole('link', { name: /הקלטה ראשונה/ })).toContainText('1:02:05');
  await expect(page.getByRole('link', { name: /הקלטה שניה/ })).toHaveAttribute('href', '/rh-aaaaaar2');
});

test('sets a letter as the reader app does: its head, its body, its signature, its notes unnumbered', async ({ page }) => {
  await page.goto('/sample/1/5');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('אגרת לדוגמה');
  await expect(page.locator('.eyebrow')).toHaveText('חלק א׳');
  const role = (cls: string) => page.locator(`.igros .torah p.${cls}`);
  await expect(role('l-dateline')).toHaveText('ב"ה, תאריך לדוגמה');
  await expect(role('l-addressee')).toHaveText('כבוד הנמען לדוגמה');
  await expect(role('l-greeting')).toHaveText('שלום וברכה!');
  await expect(role('l-body')).toHaveCount(2);
  await expect(role('l-signature')).toHaveCount(1);
  expect(await role('l-signature').evaluate((el) => getComputedStyle(el).textAlign)).toBe('end');
  expect(await role('l-body').first().evaluate((el) => getComputedStyle(el).textIndent)).not.toBe('0px');
  expect(await page.locator('.igros .torah').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('DavidCLM');
  // The note on the whole letter has no number; the one the words point to keeps its own.
  await expect(page.locator('#n-n1 .fl')).toHaveCount(0);
  await expect(page.locator('#n-n2 .fl')).toHaveText('2');
});

test('keeps a letter’s date, place, addressee and handwritten copy in the corner menu', async ({ page }) => {
  await page.goto('/sample/1/5');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד' }).click();
  const sheet = page.getByRole('dialog', { name: 'עוד' });
  await expect(sheet.getByRole('button', { name: /מקום.*עיר לדוגמה/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /אל.*נמען לדוגמה/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /כתב יד/ })).toBeVisible();
  // Labels a person set are not marked as a machine's.
  await expect(sheet.getByText('במכונה, עוד לא נבדק בידי אדם')).toHaveCount(0);
  await sheet.getByRole('button', { name: /מקום/ }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
});

test('marks a letter’s labels a machine guessed, until a person checks them', async ({ page }) => {
  await page.goto('/sample/1/6');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד' }).click();
  await expect(page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: /מקום.*עיר לדוגמה.*במכונה, עוד לא נבדק בידי אדם/ })).toBeVisible();
});

test('draws a sicha without the letter’s layout', async ({ page }) => {
  await page.goto('/sample/1/1');
  await expect(page.locator('.igros')).toHaveCount(0);
  await expect(page.locator('.torah p.end')).toHaveText('חתימה לדוגמה');
});

test('reads an index as printed: entries, letters, find, ע"ע and a page that opens its sicha', async ({ page }) => {
  await page.goto('/sample-sichos-index/12');
  await page.waitForLoadState('networkidle');
  const entries = page.locator('.ix .torah .ix-e');
  await expect(entries).toHaveCount(3);
  await expect(entries.first().locator('.ix-h')).toHaveText('אהבה לדוגמה');
  expect(await entries.first().locator('.ix-h').evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
  // The letters on top jump to their first entries; a letter with none is not a link.
  const letters = page.getByRole('navigation', { name: 'לפי אות' });
  await expect(letters.getByRole('link')).toHaveText(['א', 'ב', 'ת']);
  await expect(letters.getByRole('link', { name: 'ב' })).toHaveAttribute('href', '#s-t2');
  // ע"ע jumps to the entry on this page.
  await expect(page.locator('.see')).toHaveAttribute('href', '#s-t3');
  // Find looks in this index only, among its entries.
  await page.getByRole('searchbox', { name: 'חיפוש במפתח הזה' }).fill('בריאה');
  await expect(entries.filter({ visible: true })).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'חיפוש במפתח הזה' }).fill('אין כזה');
  await expect(page.getByText('אין ערך כזה במפתח הזה.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'חיפוש במפתח הזה' }).fill('');
  await expect(entries.filter({ visible: true })).toHaveCount(3);
  // A page names its sicha, then opens it at that page: page 25 is in the sicha that starts on 20.
  await page.locator('.ref', { hasText: '25' }).click();
  const pop = page.getByRole('dialog', { name: 'עמוד 25' });
  await expect(pop).toContainText('חלק י״ב, עמ׳ 25');
  await expect(pop).toContainText('שיחה לדוגמה');
  await expect(pop.getByRole('link', { name: 'לשיחה, בעמוד הזה' })).toHaveAttribute('href', '/sample-sichos/12/2');
  // A page the catalog does not have offers the index's own scan, never a broken link.
  await page.locator('.ref', { hasText: '90' }).click();
  await expect(page.getByRole('dialog', { name: 'עמוד 90' }).getByRole('link', { name: 'הסריקה של השיחה' })).toHaveAttribute('href', 'https://drive.google.com/file/d/sample-drive-file-2/view');
});
