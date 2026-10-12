import { expect, test } from '@playwright/test';

// The pages and the saves come from the stand-in API (fixture-api.ts).
test.skip(!!process.env.BASE_URL, 'made-up pages exist only on the local build');

test('Edit opens the same page with only its own fields, and saves a name on leaving it', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/sample/1/1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: 'עריכה' }).click();
  await expect(page).toHaveURL(/\?edit/);
  await expect(page.getByRole('region', { name: 'עריכה' })).toContainText('רק התוכן של הדף הזה');

  const name = page.getByLabel('שם', { exact: true });
  await expect(name).toHaveValue('שיחה ראשונה');
  await name.fill('שיחה א׳');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('נשמר. עין שנייה תבדוק');
  // A rename, and only the name: the item's other data (its words) is never sent, so it cannot be lost.
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { operations: unknown[]; apply: boolean; data?: unknown }[];
  expect(sent.at(-1)!.operations).toEqual([{ op: 'rename', item: 'rh-aaaaaab1', name: { he: 'שיחה א׳' } }]);
  expect(sent.at(-1)!.apply).toBe(true);
  expect(sent.at(-1)!.data).toBeUndefined();

  // The sefer it is in is edited on its own page.
  await expect(page.getByRole('link', { name: /לערוך שם/ })).toHaveAttribute('href', '/sample?edit');
  await page.getByRole('link', { name: 'סיום' }).click();
  await expect(page).toHaveURL(/\/sample\/1\/1$/);
  await expect(page.getByLabel('שם', { exact: true })).toHaveCount(0);
});

test('signed out, Edit says to sign in and keeps the page as it was', async ({ page }) => {
  await page.goto('/sample/1/1?edit');
  await page.waitForLoadState('networkidle');
  const name = page.getByLabel('שם', { exact: true });
  await name.fill('שם אחר');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('כדי לערוך צריך להיכנס');
});

test('a shelf\'s Edit shows its own name, and saves it by a rename', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/sets/the-rebbe');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'עריכה' }).click();
  await expect(page).toHaveURL(/\/sets\/the-rebbe\?edit/);
  await expect(page.getByRole('region', { name: 'עריכה' })).toBeVisible();

  const name = page.getByLabel('שם', { exact: true });
  await expect(name).toHaveValue('הרבי');
  await page.getByLabel('שם באנגלית').fill('The Rebbe');
  await page.getByLabel('שם באנגלית').press('Enter');
  await expect(page.getByRole('status')).toContainText('נשמר');
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { operations: unknown[] }[];
  expect(sent.at(-1)!.operations).toEqual([{ op: 'rename', item: 'rh-aaaaaas3', name: { en: 'The Rebbe' } }]);
  // Its sefarim are still there, each edited on its own page.
  await expect(page.getByRole('link', { name: /שיחות לדוגמה/ }).first()).toBeVisible();
});

test('a sefer\'s Edit shows its title, and the shelf it is on is edited on the shelf\'s page', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/sample-sichos?edit');
  await page.waitForLoadState('networkidle');
  const name = page.getByLabel('שם', { exact: true });
  await expect(name).toHaveValue('שיחות לדוגמה');
  await name.fill('שיחות לדוגמה, מתוקן');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('נשמר');
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { operations: unknown[] }[];
  expect(sent.at(-1)!.operations).toEqual([{ op: 'rename', item: 'rh-aaaaaaw1', name: { he: 'שיחות לדוגמה, מתוקן' } }]);
  await expect(page.locator('.linked', { hasText: 'נמצא במדף' }).getByRole('link')).toHaveAttribute('href', '/sets/the-rebbe-sample-sichos?edit');
  await page.getByRole('link', { name: 'סיום' }).click();
  await expect(page).toHaveURL(/\/sample-sichos$/);
});

test('a volume has no name of its own: Edit sends to its sefer', async ({ page }) => {
  await page.goto('/sample-sichos/3?edit');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: 'עריכה' })).toBeVisible();
  await expect(page.getByLabel('שם', { exact: true })).toHaveCount(0);
  await expect(page.locator('.linked', { hasText: 'נמצא בספר' }).getByRole('link')).toHaveAttribute('href', '/sample-sichos?edit');
});

test('an event\'s Edit, from its corner menu, renames it', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/listen/5732/rh-3dvjfkyc');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'עוד', exact: true }).click();
  await page.getByRole('dialog', { name: 'עוד' }).getByRole('button', { name: 'עריכה' }).click();
  await expect(page).toHaveURL(/\?edit/);
  const name = page.getByLabel('שם', { exact: true });
  await expect(name).toHaveValue('התוועדות לדוגמה');
  await name.fill('התוועדות לדוגמה, מתוקן');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('נשמר');
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { operations: unknown[] }[];
  expect(sent.at(-1)!.operations).toEqual([{ op: 'rename', item: 'rh-3dvjfkyc', name: { he: 'התוועדות לדוגמה, מתוקן' } }]);
  await page.getByRole('link', { name: 'סיום' }).click();
  await expect(page).toHaveURL(/\/listen\/5732\/rh-3dvjfkyc$/);
});

test('a name waiting for a second look can be changed again in the same Edit', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  await page.goto('/sample-sichos?edit');
  await page.waitForLoadState('networkidle');
  const name = page.getByLabel('שם', { exact: true });
  await name.fill('שיחות לדוגמה, א');
  await name.press('Enter');
  await expect(page.getByRole('status')).toContainText('עין שנייה תבדוק');
  await name.fill('שיחות לדוגמה, ב');
  await name.press('Enter');
  await expect(page.getByRole('status').last()).toContainText('עין שנייה תבדוק');
  // Each says what it replaces as the site still has it, so neither is refused as "the page changed".
  const sent = (await (await page.request.get('http://localhost:3002/_edits')).json()) as { operations: unknown[] }[];
  expect(sent.at(-1)!.operations).toEqual([{ op: 'rename', item: 'rh-aaaaaaw1', name: { he: 'שיחות לדוגמה, ב' } }]);
});

test('opening Edit draws the same page at once, without reading it again', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  for (const path of ['/sample-sichos', '/listen/5732/rh-3dvjfkyc']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const reads: string[] = [];
    const count = (r: { url: () => string }) => new URL(r.url()).origin === 'http://localhost:3001' && reads.push(r.url());
    page.on('request', count);
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'עריכה' }).click();
    await expect(page.getByRole('region', { name: 'עריכה' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    page.off('request', count);
    // Files and the routes' map (for the links Edit shows) may come; the page's data may not.
    expect(reads.filter((url) => !/\.(js|css|svg|woff2)$|^\/__manifest$/.test(new URL(url).pathname))).toEqual([]);
  }
});

test('Edit\'s fields are drawn inside the tap, before the address waits on the routes\' map', async ({ page }) => {
  await page.context().addCookies([{ name: 'rh_session', value: 'sample', url: 'http://localhost:3001' }]);
  for (const path of ['/sample-sichos', '/listen/5732/rh-3dvjfkyc']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // On a slow phone the routes' map took 0.6 s; the page then moved more than half a second after the tap,
    // which counts as a layout shift (#344).
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/__manifest*', async (route) => (await held, route.continue()));
    await page.getByRole('button', { name: 'עוד', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'עריכה' }).click();
    await expect(page.getByRole('region', { name: 'עריכה' })).toBeVisible();
    await expect(page.locator('#f-name-he')).toBeVisible();
    release();
    await expect(page).toHaveURL(/\?edit/);
    await page.unroute('**/__manifest*');
  }
});
