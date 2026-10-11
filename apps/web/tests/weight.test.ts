import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * What a first visit costs: the script, styles and fonts a browser fetches
 * before the main pages are usable, counted compressed as they travel.
 * Someone opening a shared sicha on an old phone over a slow line waits
 * for every kilobyte here (#109: 16 to 19 s, the words jumping as the
 * fonts came). The ceilings are today's weights with a little room; a PR
 * that goes over one raises it on purpose, saying why, or finds what it
 * should have loaded only where it is used.
 */

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const client = `${webRoot}/build/client`;

interface Manifest {
  entry: { module: string; imports?: string[] };
  routes: Record<string, { module: string; imports?: string[]; css?: string[] }>;
}

let manifest: Manifest;
const gz = (path: string) => gzipSync(readFileSync(`${client}${path}`), { level: 9 }).length;
const kB = (bytes: number) => Math.round(bytes / 1024);

/** The script and styles a page of `route` fetches on a first visit: the entry, the root's and the route's own, each once. */
function firstVisit(route: string): { js: number; css: number } {
  const js = new Set([manifest.entry.module, ...(manifest.entry.imports ?? [])]);
  const css = new Set<string>();
  for (const id of ['root', route]) {
    const r = manifest.routes[id]!;
    [r.module, ...(r.imports ?? [])].forEach((f) => js.add(f));
    (r.css ?? []).forEach((f) => css.add(f));
  }
  return { js: kB([...js].reduce((a, f) => a + gz(f), 0)), css: kB([...css].reduce((a, f) => a + gz(f), 0)) };
}

beforeAll(() => {
  if (!existsSync(`${client}/assets`)) execFileSync('npx', ['react-router', 'build'], { cwd: webRoot, stdio: 'ignore' });
  const file = readdirSync(`${client}/assets`).find((f) => /^manifest-.*\.js$/.test(f))!;
  const text = readFileSync(`${client}/assets/${file}`, 'utf8');
  manifest = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Manifest;
}, 120_000);

describe('a first visit', () => {
  // kB of script and of styles, compressed. A sicha, a farbrengen and a recording are all routes/item.
  const CEILINGS: Record<string, { js: number; css: number }> = {
    'routes/item': { js: 285, css: 42 },
    'routes/home': { js: 180, css: 32 },
    'routes/search': { js: 180, css: 32 },
    'routes/sets': { js: 170, css: 30 },
  };

  for (const [route, ceiling] of Object.entries(CEILINGS)) {
    it(`${route} stays within ${ceiling.js} kB of script and ${ceiling.css} kB of styles`, () => {
      const weight = firstVisit(route);
      expect(weight.js, `${route}: ${weight.js} kB of script`).toBeLessThanOrEqual(ceiling.js);
      expect(weight.css, `${route}: ${weight.css} kB of styles`).toBeLessThanOrEqual(ceiling.css);
    });
  }

  it('leaves the full calendar to the pages that use it', () => {
    // @hebcal/core with its Temporal polyfill is 30 kB; a page that only shows a date needs @hebcal/hdate.
    for (const route of ['routes/item', 'routes/home']) {
      const r = manifest.routes[route]!;
      const files = [manifest.entry.module, ...(manifest.routes.root!.imports ?? []), r.module, ...(r.imports ?? [])];
      const carrying = files.filter((f) => readFileSync(`${client}${f}`, 'utf8').includes('epochNanoseconds'));
      expect(carrying, route).toEqual([]);
    }
  });
});

describe('fonts', () => {
  const css = readFileSync(`${webRoot}/app/styles/fonts.css`, 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]!);

  it('are all WOFF2, each small enough to come with the page', () => {
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, url).toMatch(/\.woff2$/);
      expect(kB(statSync(`${webRoot}/public${url}`).size), url).toBeLessThanOrEqual(40);
    }
  });

  it('have a stand-in the device already has while they load, so the words do not jump', () => {
    const tokens = readFileSync(`${webRoot}/app/styles/tokens.css`, 'utf8');
    for (const face of ['FrankRuehlCLM', 'Frank Ruhl Libre', 'Noto Sans Hebrew']) {
      expect(css, face).toContain(`font-family: '${face} stand-in`);
      expect(tokens, face).toContain(`'${face} stand-in'`);
    }
  });
});
