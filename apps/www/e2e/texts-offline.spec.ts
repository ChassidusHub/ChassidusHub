import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

// The reading pages come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');
test.describe.configure({ mode: 'serial' });

/**
 * A site of its own for these tests, on its own port, so that "no network"
 * is the site really gone: the browser's offline switch does not reach a
 * service worker that restarts.
 */
let site = '';
let server: ChildProcess | undefined;

/** Each worker's site on a port of its own (3011, 3012, …), so the phone's and the desktop's never meet. */
async function start() {
  const port = 3011 + test.info().parallelIndex;
  site = `http://localhost:${port}`;
  server = spawn(process.execPath, ['--import', 'tsx', 'server/node.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), API_URL: 'http://localhost:3002' }, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${site}/favicon.svg`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the site did not start');
}
async function stop() {
  const running = server!;
  const gone = new Promise((r) => (running.exitCode !== null ? r(null) : running.once('exit', r)));
  running.kill();
  await gone;
  server = undefined;
}
test.beforeEach(start);
test.afterEach(async () => server && (await stop()));

/** The page once the service worker looks after it (it is asked for once the page is quiet). */
async function withWorker(page: Page) {
  await page.goto(`${site}/sample/1/1`);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 15_000 });
}

test('a click to a sicha reads its words from their own address, kept for good', async ({ page }) => {
  await withWorker(page);
  const words = page.waitForResponse((r) => r.url().includes('/_/words/rh-aaaaaab2/'));
  await page.getByRole('link', { name: /שיחה שניה/ }).last().click();
  const answer = await words;
  expect(answer.status()).toBe(200);
  expect(answer.headers()['cache-control']).toContain('immutable');
  await expect(page.locator('.torah p')).toHaveCount(2);
});

test('an address whose words have since changed sends on to the words as they are now', async ({ request }) => {
  const answer = await request.get(`${site}/_/words/rh-aaaaaab2/00000000000000000000`, { maxRedirects: 0 });
  expect(answer.status()).toBe(302);
  expect(answer.headers()['cache-control']).toBe('no-store');
  expect(answer.headers()['location']).toMatch(/^\/_\/words\/rh-aaaaaab2\/[0-9a-f]{20}$/);
  const now = await request.get(`${site}${answer.headers()['location']}`);
  expect((await now.json()).body).toContain('<p');
});

test('sichos already read open again with no network', async ({ page }) => {
  await withWorker(page);
  // Opened again once the worker looks after the page, so the whole page is kept too.
  await page.reload();
  await page.getByRole('link', { name: /שיחה שניה/ }).last().click();
  await expect(page.locator('.torah p')).toHaveCount(2);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await stop();
  // A click back, then each page opened whole, all from what this browser kept.
  await page.getByRole('link', { name: /שיחה ראשונה/ }).last().click();
  await expect(page).toHaveURL(/\/sample\/1\/1$/);
  await expect(page.locator('.torah p')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.torah p')).toHaveCount(4);
  await page.getByRole('link', { name: /שיחה שניה/ }).last().click();
  await expect(page.locator('.torah p')).toHaveCount(2);
  // A page never opened says so, in Hebrew.
  await page.goto(`${site}/sample/1/3`);
  await expect(page.getByRole('heading', { name: 'אין חיבור לרשת' })).toBeVisible();
});
