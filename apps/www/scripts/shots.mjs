// Screenshots of pages for a pull request: each path on a phone (390 px) and a
// desktop (1440 px), light and dark, full page.
// Usage: node scripts/shots.mjs <out dir> <path>... (the built site must be
// running, `npm start`; BASE_URL and CHROMIUM_PATH as for the browser tests).
// SHOTS_COOKIE (name=value) signs the pages in, for the stand-in API's sample reader.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [out, ...paths] = process.argv.slice(2);
if (!out || paths.length === 0) throw new Error('usage: node scripts/shots.mjs <out dir> <path>...');
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:3001';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [device, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: device === 'phone' ? 2 : 1 });
    const cookie = process.env.SHOTS_COOKIE?.split('=');
    if (cookie) await page.context().addCookies([{ name: cookie[0], value: cookie.slice(1).join('='), url: base }]);
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const name = (p.replace(/\?.*$/, '').replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home') + `-${device}-${colorScheme}.png`;
      await page.screenshot({ path: path.join(out, name), fullPage: true });
      console.log(name);
    }
    await page.close();
  }
}
await browser.close();
