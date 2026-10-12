import { expect, test, type Page, type Route } from '@playwright/test';

// The pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

/**
 * Holds back the page's scripts, as a slow phone does for its first 2 to 3
 * seconds, until `release` is called: the page is painted but not yet alive.
 */
async function slowScripts(page: Page) {
  const held: Route[] = [];
  let released = false;
  await page.route('**/assets/*.js', (route) => (released ? route.continue() : held.push(route)));
  return async () => {
    released = true;
    for (const route of held.splice(0)) await route.continue();
  };
}

test('a footnote tapped before the scripts come opens where the reader is, once they come', async ({ page }) => {
  const release = await slowScripts(page);
  await page.goto('/sample/1/1', { waitUntil: 'domcontentloaded' });
  const mark = page.getByRole('link', { name: 'הערה 1' });
  await mark.click();
  // The no-script link to the notes at the end of the page is held: the reader stays where they are.
  expect(await page.evaluate(() => location.hash)).toBe('');
  await expect(mark).toHaveAttribute('data-wait', '');
  await release();
  await expect(page.getByRole('dialog', { name: 'הערה 1' })).toContainText('הערה ראשונה לדוגמה.');
  await expect(mark).not.toHaveAttribute('data-wait');
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('a path bar level tapped before the scripts come opens its choices once they come', async ({ page }) => {
  const release = await slowScripts(page);
  await page.goto('/sample-sichos/12', { waitUntil: 'domcontentloaded' });
  const level = page.getByRole('navigation', { name: 'המקום באתר' }).getByRole('button', { name: /חלק י״ב/ });
  // Tapped twice while waiting: still one tap, so the choices open rather than open and close.
  await level.click();
  await level.click();
  await expect(level).toHaveAttribute('data-wait', '');
  await release();
  await expect(page.getByRole('menuitemradio', { name: /חלק י״ג/ })).toBeVisible();
});

test('words selected before the scripts come get their Fix bar at once, and Fix tapped on it opens once they come', async ({ page }) => {
  const release = await slowScripts(page);
  await page.goto('/sample/1/1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const root = document.querySelector('#s-p1')!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf('ראשונה');
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 'ראשונה'.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      return;
    }
  });
  // Drawn by the page itself, before its scripts (#345), and held like any button.
  const bar = page.getByRole('toolbar', { name: 'המילים שסומנו' });
  await expect(bar).toBeVisible();
  const fix = bar.getByRole('button', { name: 'תקן' });
  await fix.click();
  await expect(fix).toHaveAttribute('data-wait', '');
  await release();
  await expect(page.getByRole('dialog', { name: 'תיקון' })).toContainText('ראשונה');
  await expect(page.locator('.pop[data-early]')).toHaveCount(0);
});

test('a link tapped before the scripts come shows its page at once, and opens it once they come', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  const release = await slowScripts(page);
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  const rebbe = page.locator('main').getByRole('link', { name: /^הרבי/ });
  const href = (await rebbe.getAttribute('href'))!;
  await rebbe.click();
  // Its frame is drawn now, at its address, with no new page asked for.
  await expect(page.locator('.first-frame h1')).toHaveText('הרבי');
  expect(await page.evaluate(() => location.pathname)).toBe(href);
  await release();
  await expect(page.locator('main h1')).toHaveText('הרבי');
  await expect(page.locator('.first-frame')).toHaveCount(0);
  expect(await page.evaluate(() => location.pathname)).toBe(href);
  // The library came to life as it was drawn, and Back goes to it.
  expect(errors).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
});
