import { expect, test } from '@playwright/test';

test('about says how a change gets in, and leads to helping, the code and a takedown', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('אודות ChassidusHub');
  await expect(page.locator('.steps li')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /בדיקת מה שמכונה כתבה/ })).toHaveAttribute('href', '/back');
  await expect(page.getByRole('link', { name: 'הקוד ב-GitHub' })).toHaveAttribute('href', 'https://github.com/ChassidusHub/ChassidusHub');
  await page.getByRole('link', { name: 'בקשת הסרה' }).click();
  await expect(page).toHaveURL(/\/takedown$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('בקשת הסרה');
});

test.describe('asking for a takedown', () => {
  test.skip(!!process.env.BASE_URL, 'a request is sent only to the stand-in API');

  test('a takedown request is sent with no account, and its number is shown', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one request is enough');
    await page.goto('/takedown?what=https%3A%2F%2Fchassidushub.org%2Fsample%2F1%2F1');
    await expect(page.getByLabel(/מה להסיר/)).toHaveValue('https://chassidushub.org/sample/1/1');
    await page.getByLabel('השם שלכם').fill('ראובן');
    await page.getByLabel('כתובת מייל לתשובה').fill('reuven@example.com');
    await page.getByLabel('המשפחה').check();
    await page.getByLabel('למה, בכמה מילים').fill('ההקלטה הזאת שייכת למשפחה שלנו.');
    await page.getByRole('button', { name: 'שליחת הבקשה' }).click();
    await expect(page.getByText(/הבקשה התקבלה/)).toBeVisible();
    const sent = (await (await page.request.get('http://localhost:3002/_takedowns')).json()) as { relation: string; target: string }[];
    expect(sent.at(-1)).toMatchObject({ relation: 'family', target: 'https://chassidushub.org/sample/1/1' });
  });

  test('a refusal is said in Hebrew and the form stays', async ({ page }) => {
    await page.goto('/takedown');
    await page.getByLabel(/מה להסיר/).fill('https://chassidushub.org/sample');
    await page.getByLabel('השם שלכם').fill('ראובן');
    await page.getByLabel('כתובת מייל לתשובה').fill('reuven@example.com');
    await page.getByLabel('אחר').check();
    // The browser counts the spaces as letters; the site trims them before sending, so the API refuses it.
    await page.getByLabel('למה, בכמה מילים').fill('          קצר     ');
    await page.getByRole('button', { name: 'שליחת הבקשה' }).click();
    await expect(page.getByRole('alert')).toHaveText('כתבו בכמה מילים למה (10 עד 4000 תווים).');
    await expect(page.getByRole('button', { name: 'שליחת הבקשה' })).toBeVisible();
  });
});
