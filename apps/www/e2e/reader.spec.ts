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
  // A quiet dot at the start of each paragraph, not a line under the words.
  const p = page.locator('.torah.unchecked p').first();
  expect(await p.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
  expect(await p.evaluate((el) => getComputedStyle(el, '::before').width)).toBe('5px');
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

test('sets a day of Hayom Yom as the book prints it: its head, its notices, its shiurim, its sayings', async ({ page }) => {
  await page.goto('/hayom-yom/1/1');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('יט כסלו');
  await expect(page.locator('.eyebrow')).toHaveText('היום יום · כסלו');
  const day = page.locator('.daybook .torah');
  await expect(day.locator('.hy-head')).toHaveText(/שבת\s*יט כסלו\s*ה׳תש״ג/);
  await expect(day.locator('.hy-lead #s-lead-1.m')).toHaveText('מכתב לדוגמה שלפני היום הראשון.');
  await expect(day.locator('.hy-pre p')).toHaveText('הודעה לדוגמה לפני השיעורים.');
  expect(await day.locator('.hy-pre').evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
  // Each shiur opens its words on the site; the Tanya line is the print's, marked as read by a machine.
  await expect(day.locator('.hy-shiurim a').first()).toHaveAttribute('href', /^\/chumash\/genesis\/\d+/);
  await expect(day.getByRole('link', { name: 'צ-צו.' })).toHaveAttribute('href', '/tehillim/90');
  await expect(day.locator('.hy-tanya a')).toHaveAttribute('href', /^\/tanya\//);
  await expect(day.locator('#s-tanya')).toHaveClass(/\bm\b/);
  // The sayings come after the shiurim; there are no rules above or under the text, no today and nothing to tick.
  expect(await day.locator('.hy-shiurim').evaluate((el) => el.compareDocumentPosition(document.getElementById('s-p1')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  expect(await day.locator('.hy-head').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('none');
  await expect(page.getByText('היום', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
});

test('reads Hayom Yom as a book: a strip of the month’s days, the day after at the foot', async ({ page }) => {
  await page.goto('/hayom-yom/1/1');
  await page.waitForLoadState('networkidle');
  const strip = page.getByRole('navigation', { name: 'ימי החודש' });
  await expect(strip.getByRole('link', { name: 'יט כסלו' })).toHaveAttribute('aria-current', 'page');
  await strip.getByRole('link', { name: 'כ כסלו' }).click();
  await expect(page).toHaveURL(/\/hayom-yom\/1\/2$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('כ כסלו');
  await expect(page.locator('.daybook .hy-head')).toHaveText(/יום ראשון\s*כ כסלו\s*ה׳תש״ג/);
  await expect(page.getByRole('link', { name: 'יט כסלו' }).last()).toHaveAttribute('rel', 'prev');
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
  await expect(pop).toContainText('חלק יב, עמ׳ 25');
  await expect(pop).toContainText('שיחה לדוגמה');
  await expect(pop.getByRole('link', { name: 'לשיחה, בעמוד הזה' })).toHaveAttribute('href', '/sample-sichos/12/2');
  // A page the catalog does not have offers the index's own scan, never a broken link.
  await page.locator('.ref', { hasText: '90' }).click();
  await expect(page.getByRole('dialog', { name: 'עמוד 90' }).getByRole('link', { name: 'הסריקה של השיחה' })).toHaveAttribute('href', 'https://drive.google.com/file/d/sample-drive-file-2/view');
});

test('reads a farbrengen as it was said: its occasion, its stage lines, its maamar, its recording, unedited', async ({ page }) => {
  await page.goto('/sample-hisvaaduyos/11/4');
  await page.waitForLoadState('networkidle');
  // The occasion and the day, without the print's ב"ס"ד and "שיחת"; the Hebrew date under it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('יום לדוגמה, יו"ד שבט ה\'תשי"ד');
  await expect(page.locator('.ssub')).toContainText('שבט');
  // The print's own בלתי מוגה line is the chip under the title.
  await expect(page.locator('.hv-head .hv-flag')).toHaveText('בלתי מוגה');
  await expect(page.locator('.torah .hv-muga')).toBeHidden();
  // What happened between the words, in a quiet line; the talk itself is not.
  await expect(page.locator('#s-p2')).toHaveClass(/stage/);
  await expect(page.locator('#s-g1')).toHaveClass(/stage/);
  await expect(page.locator('#s-s0')).not.toHaveClass(/stage/);
  // The print's *** between the parts is a short rule, not three stars.
  const divider = page.locator('#s-x1');
  await expect(divider).toHaveClass(/divider/);
  expect(await divider.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(4);
  // The maamar said there: a chip under the title, and a card where the words say it was said.
  await expect(page.locator('.hv-head').getByRole('link', { name: /מאמר: ד"ה מאמר לדוגמה/ })).toHaveAttribute('href', '/sample-hisvaaduyos/11/3');
  await expect(page.locator('#s-p2 + a.hv-said')).toHaveAttribute('href', '/sample-hisvaaduyos/11/3');
  await expect(page.getByRole('link', { name: /לשמוע את ההתוועדות/ })).toHaveAttribute('href', '/listen/5714/rh-aaaaaave?r=rh-aaaaaavr');
});

test('jumps to a farbrengen’s sections: down the side on a wide screen, in the corner menu on a phone', async ({ page }, info) => {
  await page.goto('/sample-hisvaaduyos/11/4');
  await page.waitForLoadState('networkidle');
  if (info.project.name === 'desktop') {
    const rail = page.locator('.hv-rail');
    await expect(rail.getByRole('link')).toHaveText(['א', 'ב', 'ג', 'ד', 'ה']);
    await expect(rail.getByRole('link', { name: 'א' })).toHaveAttribute('aria-current', 'location');
    await rail.getByRole('link', { name: 'ד' }).click();
    await expect(page).toHaveURL(/#s-s2$/);
    await expect(rail.getByRole('link', { name: 'ד' })).toHaveAttribute('aria-current', 'location');
  } else {
    await expect(page.locator('.hv-rail')).toBeHidden();
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    const jumps = page.getByRole('dialog', { name: 'עוד' }).getByRole('navigation', { name: 'סעיפים' });
    await expect(jumps.getByRole('link')).toHaveText(['א', 'ב', 'ג', 'ד', 'ה']);
    await jumps.getByRole('link', { name: 'ג' }).click();
    await expect(page).toHaveURL(/#s-s1$/);
    await expect(page.getByRole('dialog', { name: 'עוד' })).toBeHidden();
    await expect(page.locator('#s-s1')).toBeInViewport();
  }
});

test('reads a chapter of Tanya: its own name, its part’s chapters, bold openings, no shiur markers', async ({ page }) => {
  await page.goto('/tanya/1/4');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('פרק א׳');
  await expect(page.locator('.ssub')).toHaveText('תניא · חלק ראשון, ליקוטי אמרים');
  const row = page.getByRole('navigation', { name: 'הפרקים' });
  await expect(row.getByRole('link')).toHaveText(['הסכמות', 'הקדמת המלקט', 'א']);
  await expect(row.getByRole('link', { name: 'א', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.chapters #s-1 b')).toHaveText('פתיחה');
  await expect(page.locator('.chapters .mk')).toBeHidden();
});

test('reads Tanya in English, or both side by side, the translation’s notes under it', async ({ page }) => {
  await page.goto('/tanya/1/4');
  await page.waitForLoadState('networkidle');
  const languages = page.getByRole('navigation', { name: 'שפה' });
  await expect(languages.getByRole('link', { name: 'עברית' })).toHaveAttribute('aria-current', 'true');
  await languages.getByRole('link', { name: 'שתיהן' }).click();
  await expect(page).toHaveURL(/\?language=both$/);
  await expect(page.locator('.chapters.paired .pair').nth(1).locator('p')).toHaveText(['פסקה שניה לדוגמה.', 'A second paragraph, for example.']);
  await expect(page.locator('.chapters .tr').first()).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.notes li')).toHaveText(/A note of the translation\./);
  await languages.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\?language=en$/);
  await expect(page.locator('.chapters.en .torah p').first()).toHaveText('An opening, for example.1');
  expect(await page.locator('.chapters.en .torah').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
});

test('reads a siman with its seifim numbered, its preface and name apart, and its other edition a tap away', async ({ page }) => {
  await page.goto('/shulchan-aruch-harav/2/2');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('סימן א׳');
  await expect(page.locator('.ch-head .chip')).toHaveText(['ג׳ סעיפים', 'מהדורא תניינא']);
  await expect(page.getByRole('link', { name: 'מהדורא תניינא' })).toHaveAttribute('href', '/shulchan-aruch-harav/2/1/1');
  const words = page.locator('.chapters .torah');
  await expect(words.locator('#s-1 .sa-pre')).toHaveText('הקדמה לדוגמה.');
  await expect(words.locator('#s-1 .sa-name')).toHaveText('דין לדוגמה ובו ג׳ סעיפים:');
  await expect(words.locator('[data-seif]')).toHaveCount(3);
  expect(await words.locator('#s-3').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"סעיף ג"');
  await expect(words.locator('#s-2 .paren')).toHaveText('(מילים בסוגריים)');
});
