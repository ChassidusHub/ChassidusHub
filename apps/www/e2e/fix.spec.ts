import { expect, test, type Page } from '@playwright/test';

// The pages and the fixes come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

/** Selects `words` inside the element `selector`, as a reader's finger or mouse would. */
async function select(page: Page, selector: string, words: string) {
  await page.evaluate(
    ([selector, words]) => {
      const root = document.querySelector(selector!)!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(words!);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + words!.length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        return;
      }
      throw new Error(`no "${words}" in ${selector}`);
    },
    [selector, words],
  );
}

const signIn = (page: Page) => page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);

test('selecting words shows the bar; Fix sends a few words live, and Undo takes them back', async ({ page }) => {
  await signIn(page);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await select(page, '#s-p1', 'ראשונה');
  const bar = page.getByRole('toolbar', { name: 'המילים שסומנו' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'תקן' }).click();

  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  const box = sheet.getByLabel('המילים הנכונות');
  await expect(box).toHaveValue('ראשונה');
  await box.fill('הראשונה');
  await sheet.getByRole('button', { name: 'שמירה' }).click();

  await expect(page.getByRole('status')).toContainText('תוקן. תודה');
  await expect(page.locator('#s-p1 .fixed')).toHaveText('הראשונה');
  // The API got the whole paragraph, before and after, with its bold, its ois and its note kept.
  const sent = (await (await page.request.get('http://localhost:3002/_fixes')).json()) as { item: string; segment: string; after: unknown }[];
  expect(sent.at(-1)).toMatchObject({ item: 'rh-aaaaaab1', segment: 'p1' });
  expect(sent.at(-1)!.after).toEqual([{ text: 'א.', marks: ['ois'] }, { text: ' פסקה הראשונה לדוגמה, ובה ' }, { text: 'מילה מודגשת', marks: ['b'] }, { text: ' והערה' }, { note: 'n1' }, { text: '.' }]);

  await page.getByRole('status').getByRole('button', { name: 'בטל' }).click();
  await expect(page.getByRole('status')).toContainText('בוטל');
  await expect(page.locator('#s-p1 .fixed')).toHaveCount(0);
  await expect(page.locator('#s-p1')).toContainText('פסקה ראשונה לדוגמה');
});

test('more than five words wait for a reviewer', async ({ page }) => {
  await signIn(page);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await select(page, '#s-p2', 'נוספת');
  await page.getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await sheet.getByLabel('המילים הנכונות').fill('נוספת ועוד שש מילים שלא היו כאן');
  await expect(sheet).toContainText('עין שנייה תבדוק');
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByRole('status')).toContainText('נשלח. עין שנייה תבדוק');
  await expect(page.locator('#s-p2 .fixed')).toHaveCount(0);
});

test('signed out, the sheet asks to sign in and keeps the words typed', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await select(page, '#s-p1', 'ראשונה');
  await page.getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await sheet.getByLabel('המילים הנכונות').fill('הראשונה');
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(sheet.getByRole('alert')).toContainText('צריך להיכנס');
  await expect(sheet.getByRole('link', { name: 'כניסה' })).toHaveAttribute('href', '/signin?return=%2Fsample%2F1%2F1');

  // Back on the page after signing in: the fix is open again, with what they typed.
  await signIn(page);
  await page.goto('/sample/1/1');
  await expect(page.getByRole('dialog', { name: 'תיקון' }).getByLabel('המילים הנכונות')).toHaveValue('הראשונה');
});

test('a footnote mark is never part of a fix; the words can still be copied', async ({ page }) => {
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const p = document.querySelector('#s-p1')!;
    const range = document.createRange();
    range.setStart(p.querySelector('a.nm')!.previousSibling!, 0);
    range.setEndAfter(p.querySelector('a.nm')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  const bar = page.getByRole('toolbar', { name: 'המילים שסומנו' });
  await expect(bar.getByRole('button', { name: 'העתק עם מקור' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'תקן' })).toHaveCount(0);
});

test('a footnote\'s words can be fixed too', async ({ page }) => {
  await signIn(page);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await select(page, '#n-n2 .nt', 'שניה');
  await page.getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await sheet.getByLabel('המילים הנכונות').fill('שנייה');
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('#n-n2 .fixed')).toHaveText('שנייה');
});

test('a transcript\'s words are fixed the same way, and Undo takes them back', async ({ page }) => {
  await signIn(page);
  await page.goto('/listen/5732/rh-3dvjfkyc');
  await page.waitForLoadState('networkidle');
  await select(page, '#w-p2', 'שניה');
  await page.getByRole('toolbar', { name: 'המילים שסומנו' }).getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await sheet.getByLabel('המילים הנכונות').fill('שנייה');
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(page.locator('#w-p2')).toHaveText('פסקה שנייה לדוגמה, ועוד כמה מילים.');
  const sent = (await (await page.request.get('http://localhost:3002/_fixes')).json()) as { item: string; segment: string; before: unknown; after: unknown }[];
  expect(sent.find((f) => f.segment === 'p2' && f.item === 'rh-1awcd7t9')).toMatchObject({ before: 'פסקה שניה לדוגמה, ועוד כמה מילים.', after: 'פסקה שנייה לדוגמה, ועוד כמה מילים.' });
  await page.getByRole('status').getByRole('button', { name: 'בטל' }).click();
  await expect(page.locator('#w-p2')).toHaveText('פסקה שניה לדוגמה, ועוד כמה מילים.');
});

test('a double-clicked word that a footnote mark follows can still be fixed, and the sheet shows what it replaces', async ({ page }) => {
  await signIn(page);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  // "והערה" is written right before the mark "1": a double-click selects "והערה1".
  await select(page, '#s-p1', 'והערה');
  await page.evaluate(() => {
    const range = getSelection()!.getRangeAt(0);
    range.setEnd(document.querySelector('#s-p1 a.nm')!.firstChild!, 1);
  });
  const bar = page.getByRole('toolbar', { name: 'המילים שסומנו' });
  await bar.getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await expect(sheet.locator('.was q')).toHaveText('והערה');
  await expect(sheet.getByLabel('המילים הנכונות')).toHaveValue('והערה');
});

test('signed out, nothing is sent to the API', async ({ page }) => {
  const before = ((await (await page.request.get('http://localhost:3002/_fixes')).json()) as unknown[]).length;
  await page.goto('/sample/1/2');
  await page.waitForLoadState('networkidle');
  await select(page, '#s-p1', 'מכונה');
  await page.getByRole('button', { name: 'תקן' }).click();
  const sheet = page.getByRole('dialog', { name: 'תיקון' });
  await sheet.getByLabel('המילים הנכונות').fill('המכונה');
  await sheet.getByRole('button', { name: 'שמירה' }).click();
  await expect(sheet.getByRole('alert')).toContainText('צריך להיכנס');
  expect(((await (await page.request.get('http://localhost:3002/_fixes')).json()) as unknown[]).length).toBe(before);
});
