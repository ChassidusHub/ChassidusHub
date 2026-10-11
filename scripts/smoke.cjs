// Opens the live site's main pages in a real browser, as a reader on a phone
// would, and fails if any of them breaks: a page that does not answer 200, a
// script error, an error in the console, or a request of the site's own that
// fails (a 404 like /_/auth/me's, which the server-side tests could not see).
// Run by .github/workflows/smoke.yml after each deploy:
//   SITE=https://chassidushub.org node scripts/smoke.cjs
// CommonJS, so it finds Playwright on NODE_PATH without being a dependency.
const { chromium, devices } = require('playwright');

const SITE = (process.env.SITE ?? 'https://chassidushub.org').replace(/\/$/, '');
const API = (process.env.API ?? 'https://api.chassidushub.org').replace(/\/$/, '');

// While ChassidusHub is private (services/api/src/lock.ts) the pages open with the lock's key, made from CHASSIDUSHUB_PASSWORD;
// without it there is nothing to look at but the lock page.
const PASSWORD = process.env.CHASSIDUSHUB_PASSWORD?.trim();
const KEY = PASSWORD ? require('node:crypto').createHash('sha256').update(`chassidushub-lock:${PASSWORD}`).digest('hex') : null;

/** The pages a reader meets first, and one of each kind under them. */
const PAGES = ['/', '/likkutei-sichos', '/likkutei-sichos?part=30', '/likkutei-sichos/30/1/1/3', '/search?q=%D7%97%D7%A0%D7%95%D7%9B%D7%94', '/daily', '/calendar', '/sets', '/suggestions', '/signin', '/status'];

async function main() {
  if (!KEY) {
    const locked = (await fetch(`${SITE}/`).then((r) => r.status).catch(() => 0)) === 401;
    if (locked) {
      // The lock page is not the site working: without the key there is nothing to look at, which counts as a failure.
      console.log('ChassidusHub is private and no CHASSIDUSHUB_PASSWORD was given: only the lock page answers.');
      process.exit(1);
    }
  }
  const browser = await chromium.launch();
  const failures = [];
  /** Every link of the site's own met on the pages, and the first page it was met on. */
  const links = new Map();
  for (const path of PAGES) {
    const started = Date.now();
    // Once more when it broke: one slow answer on the way is not a broken page.
    let problems = await visit(browser, path, links);
    if (problems.length) problems = await visit(browser, path, links);
    console.log(`${problems.length ? '✗' : '✓'} ${path} (${Date.now() - started} ms)`);
    for (const problem of problems) console.log(`    ${problem}`);
    if (problems.length) failures.push(path);
  }
  await browser.close();
  const broken = await brokenLinks(links);
  for (const { link, status, from } of broken) console.log(`✗ link ${link} answered ${status} (on ${from})`);
  if (failures.length || broken.length) {
    if (failures.length) console.log(`\n${failures.length} of ${PAGES.length} pages broke: ${failures.join(', ')}`);
    if (broken.length) console.log(`\n${broken.length} of ${links.size} links broke.`);
    process.exit(1);
  }
  console.log(`\nAll ${PAGES.length} pages are well, and all ${links.size} links on them answer.`);
}

/** What went wrong opening one page, as a reader would. */
async function visit(browser, path, links) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const host = new URL(SITE).hostname;
  if (KEY) await context.addCookies([{ name: '__Secure-rh_lock', value: KEY, domain: host === 'chassidushub.org' ? '.chassidushub.org' : host, path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`script error: ${error.message.slice(0, 200)}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource/.test(message.text())) problems.push(`console: ${message.text().slice(0, 200)}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if ((url.startsWith(SITE) || url.startsWith(API)) && response.status() >= 400) problems.push(`${response.status()} ${url}`);
  });
  const answer = await page.goto(`${SITE}${path}`, { waitUntil: 'load', timeout: 45_000 }).catch((error) => {
    problems.push(`did not load: ${error.message.split('\n')[0]}`);
    return null;
  });
  if (answer && answer.status() !== 200) problems.push(`answered ${answer.status()}`);
  // What the page asks once it runs (the account, the player) has its moment to fail.
  await page.waitForTimeout(2_500);
  // The links a reader can follow from here, to be checked once all pages are seen.
  const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href)).catch(() => []);
  for (const href of hrefs) {
    const link = internal(href);
    if (link && !links.has(link)) links.set(link, path);
  }
  if (path === '/signin') {
    const me = await fetch(`${API}/v1/auth/me`, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/130.0 ChassidusHub-smoke', ...(KEY ? { 'x-chassidushub-key': KEY } : {}) } }).then((r) => r.json()).catch(() => null);
    if (me?.google && (await page.locator('a[href*="/_/auth/google/start"]').count()) === 0) problems.push('Google sign-in is on, but /signin does not offer it');
  }
  await context.close();
  return problems;
}

/** A link's path on the site, or null for another site's, a hash on the same page, or what is not a page to read. */
function internal(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== SITE) return null;
  // /_/ is the site's own machinery (sign in and out, drafts): following it is not reading.
  if (url.pathname.startsWith('/_/') || /sign-?out|log-?out/.test(url.pathname)) return null;
  return url.pathname + url.search;
}

/** Most links to check: past this the run would be about links, not pages. */
const MAX_LINKS = 150;

/** The links that answer 400 or worse, asked a few at a time. */
async function brokenLinks(links) {
  const queue = [...links].slice(0, MAX_LINKS);
  const headers = { 'user-agent': 'Mozilla/5.0 Chrome/130.0 ChassidusHub-smoke', ...(KEY ? { cookie: `__Secure-rh_lock=${KEY}` } : {}) };
  const broken = [];
  async function worker() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [link, from] = next;
      let status = await fetch(`${SITE}${link}`, { headers }).then((r) => r.status).catch(() => 0);
      // Once more when it broke, as with the pages.
      if (status >= 400 || status === 0) status = await fetch(`${SITE}${link}`, { headers }).then((r) => r.status).catch(() => 0);
      if (status >= 400 || status === 0) broken.push({ link, status, from });
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  if (links.size > MAX_LINKS) console.log(`(Checked the first ${MAX_LINKS} of ${links.size} links.)`);
  return broken;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
