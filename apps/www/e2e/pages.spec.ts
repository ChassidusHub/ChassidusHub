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

for (const { name, path } of pages) {
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
      const sizes = await Promise.all(responses.map(async (r) => ({ type: r.request().resourceType(), url: r.url(), bytes: await sentBytes(r) })));
      const of = (type: string) => sizes.filter((s) => s.type === type);
      const sum = (list: { bytes: number }[]) => list.reduce((total, s) => total + s.bytes, 0);
      const shift = await page.evaluate(() => (window as unknown as { shift: number }).shift);

      const report = {
        serverWaitMs: Math.round(wait),
        firstVisitBytes: sum(sizes),
        javascriptBytes: sum(of('script')),
        javascriptFiles: of('script').length,
        fontBytes: sum(of('font')),
        fontFiles: of('font').length,
        htmlBytes: sum(of('document')),
        layoutShift: Number(shift.toFixed(3)),
      };
      test.info().annotations.push({ type: 'budgets', description: JSON.stringify(report) });
      for (const key of Object.keys(budgets) as (keyof typeof budgets & string)[]) {
        expect.soft(report[key], `${key} (budget ${budgets[key]})`).toBeLessThanOrEqual(budgets[key]);
      }
    });

    test('is right to left, hidden from search engines and accessible', async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.headers()['x-robots-tag']).toBe('noindex');
      await expect(page.locator('html')).toHaveAttribute('lang', 'he');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  });
}
