import { brotliCompressSync, constants } from 'node:zlib';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Response } from '@playwright/test';
import { budgets } from './budgets';
import { pages } from './pages';

/** What a response costs on the wire: its body compressed as Cloudflare compresses it, unless it came compressed. */
async function sentBytes(response: Response): Promise<number> {
  const body = await response.body().catch(() => Buffer.alloc(0));
  const type = response.headers()['content-type'] ?? '';
  if (response.headers()['content-encoding'] || !/text|javascript|json|svg|css/.test(type)) return body.length;
  return brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

for (const { name, path, budgets: own } of pages) {
  test.describe(name, () => {
    test('stays within the page budgets', async ({ page }) => {
      const responses: Response[] = [];
      page.on('response', (response) => responses.push(response));
      // Layout shifts are collected from the very start of the page.
      await page.addInitScript(() => {
        (window as unknown as { shift: number }).shift = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!entry.hadRecentInput) (window as unknown as { shift: number }).shift += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const main = await page.goto(path, { waitUntil: 'networkidle' });
      expect(main?.status()).toBe(200);

      const wait = await page.evaluate(() => {
        const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        return nav ? nav.responseStart - nav.requestStart : 0;
      });
      // The page's own load ends at its load event; what starts after it (the catalog snapshot read behind
      // the page, app/routes/shell.tsx, like the service worker) is the next click's, not this page's.
      const loaded = await page.evaluate(() => performance.timeOrigin + (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventEnd);
      const sizes = await Promise.all(responses.map(async (r) => ({ type: r.request().resourceType(), url: r.url(), bytes: await sentBytes(r), atLoad: r.request().timing().startTime <= loaded })));
      const of = (type: string) => sizes.filter((s) => s.type === type && (type !== 'script' || s.atLoad));
      const sum = (list: { bytes: number }[]) => list.reduce((total, s) => total + s.bytes, 0);
      const shift = await page.evaluate(() => (window as unknown as { shift: number }).shift);
      const preloaded = await page.evaluate(() => [...document.querySelectorAll<HTMLLinkElement>('link[rel=preload][as=font]')].map((link) => link.href));
      const preloadedFonts = of('font').filter((s) => preloaded.includes(s.url));

      const report = {
        serverWaitMs: Math.round(wait),
        firstVisitBytes: sum(sizes),
        javascriptBytes: sum(of('script')),
        javascriptFiles: of('script').length,
        preloadedFontBytes: sum(preloadedFonts),
        preloadedFontFiles: preloadedFonts.length,
        htmlBytes: sum(of('document')),
        layoutShift: Number(shift.toFixed(3)),
      };
      test.info().annotations.push({ type: 'budgets', description: JSON.stringify(report) });
      console.log(`${name} on ${test.info().project.name}: ${JSON.stringify(report)}`);
      // A page may carry its own budget for a while, named with the issue that brings it back (pages.ts).
      const limits = { ...budgets, ...own };
      for (const key of Object.keys(limits) as (keyof typeof budgets & string)[]) {
        expect.soft(report[key], `${key} (budget ${limits[key]})`).toBeLessThanOrEqual(limits[key]);
      }
    });

    test('is right to left, hidden from search engines, unframeable (but an embed) and accessible', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.headers()['x-robots-tag']).toBe('noindex');
      // No other site may frame it (clickjacking on Approve, keys and fixes).
      // Only an embed is made to sit in other sites' frames (lib/safety.ts).
      const embed = path.startsWith('/embed/');
      expect(response?.headers()['content-security-policy']).toBe(embed ? 'frame-ancestors *' : "frame-ancestors 'self'");
      expect(response?.headers()['x-frame-options']).toBe(embed ? undefined : 'SAMEORIGIN');
      await expect(page.locator('html')).toHaveAttribute('lang', 'he');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      // Both themes: the dark one has its own contrasts.
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${colorScheme} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
      }
    });
  });
}
