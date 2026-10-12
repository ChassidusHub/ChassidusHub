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

test('words selected before the scripts come get their Fix bar once they come', async ({ page }) => {
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
  await release();
  await expect(page.getByRole('toolbar', { name: 'המילים שסומנו' })).toBeVisible();
});
