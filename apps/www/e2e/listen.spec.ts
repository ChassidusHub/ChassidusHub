import { expect, test } from '@playwright/test';

/** Home and listening: where the reader stopped, and a recording's page. */
test('Home shows where the reader stopped, drawn by the server', async ({ page, context, baseURL }) => {
  const stopped = { to: '/listen/5732/rh-3dvjfkyc', title: 'כ׳ אב תשל״ב · שיחה ו׳', recording: 'rh-1awcd7t9', at: 120_000, durationMs: 600_000 };
  await context.addCookies([{ name: 'ch_listen', value: encodeURIComponent(JSON.stringify(stopped)), url: baseURL! }]);
  await page.goto('/');
  const tile = page.getByRole('link', { name: /להמשיך לשמוע/ });
  await expect(tile).toContainText('נשארו 8:00');
  await expect(tile).toHaveAttribute('href', '/listen/5732/rh-3dvjfkyc?r=rh-1awcd7t9&t=120');
});

test('a recording is one text with a heading for each part, and its path bar lists the year’s other events', async ({ page }) => {
  await page.goto('/listen/5732/rh-3dvjfkyc');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('כ׳ אב תשל״ב');
  await expect(page.locator('.tr .chh')).not.toHaveCount(0);
  await expect(page.locator('.tr .tx').first()).toBeVisible();
  await page.getByRole('button', { name: 'כ׳ אב תשל״ב' }).click();
  await expect(page.getByRole('menuitem').or(page.getByRole('option')).or(page.locator('.mi')).first()).toBeVisible();
});

test('tapping words plays from there, and lights the paragraph and the word being said', async ({ page }) => {
  await page.goto('/listen/5732/rh-3dvjfkyc');
  const second = page.locator('.tp').nth(1);
  await second.locator('.tt').click();
  await expect(second).toHaveClass(/now/);
  await expect(second.locator('.w.on')).toHaveCount(1);
  // Its text is still the paragraph's text, word by word, so fixing a word finds it.
  await expect(second.locator('.tx')).toHaveText('פסקה שניה לדוגמה, ועוד כמה מילים.');
});
