import { expect, test } from '@playwright/test';

/** The old site's addresses, as links out there still have them: each a permanent redirect here (routes/moved.ts). */
const MOVED: [string, string][] = [
  ['/sets?lang=en', '/library'],
  ['/read', '/library'],
  ['/help', '/about'],
  ['/contribute', '/about'],
  ['/check', '/back'],
  ['/account/tokens', '/account'],
  ['/calendar', '/listen'],
  ['/calendar/5742/3', '/listen/5742'],
  ['/daily', '/'],
  ['/daily/2026-09-30', '/'],
  ['/shiurim/2026-09-30', '/'],
];

for (const [from, to] of MOVED) {
  test(`${from} moved to ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe(to);
  });
}
