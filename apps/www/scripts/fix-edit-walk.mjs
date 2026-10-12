// The Fix and Edit walk: select words, Fix, sign in, live, Undo, and Edit on a
// shelf, a sefer and an event, done as a person on a phone would, each step
// timed (issue #319). The top-task walk (top-tasks.mjs) stops before Save; this
// one goes all the way, but only on a local site.
//
// A phone 390 px wide, touch, on slow 4G with a 4x slower CPU, from a fresh
// browser profile each run. Words are selected the way a long press leaves them
// (a selection in the page; headless Chromium makes none from a long press),
// and every button is pressed with a real touch tap.
//
// Sending: only to a site on localhost, which reads a local API (never the live
// one): `env -u DATABASE_URL DEV_ACCOUNT=dev LIVE_FIXES=on npm run dev:api` on
// the sample catalog (docs/local-sample.md), and `API_URL=http://localhost:8787
// npm run start` here. On any other site the walk stops before Save and never
// leaves Edit's fields changed, so it can be run against new.chassidushub.org.
//
// Usage: from apps/www, node scripts/fix-edit-walk.mjs [task numbers]
//   BASE_URL      the site (default https://new.chassidushub.org)
//   CHROMIUM_PATH a Chromium already on the machine instead of Playwright's own
//   RUNS          runs per task (default 3)
//   OUT           where results.json, report.md and the screenshots go (default fix-edit-walk)
//   THROTTLE=off  no network or CPU slowdown
//   COLOR=dark    the phone in dark mode
//   SESSION       the cookie a signed-in run carries (default rh_session=dev, the local API's DEV_ACCOUNT)
//   PAGES=fixture walk the stand-in API's pages (`npx tsx e2e/fixture-api.ts`, and API_URL=http://localhost:3002 here)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';

const base = (process.env.BASE_URL ?? 'https://new.chassidushub.org').replace(/\/$/, '');
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
const runs = Number(process.env.RUNS ?? 3);
const out = process.env.OUT ?? 'fix-edit-walk';
const throttle = process.env.THROTTLE !== 'off';
const colorScheme = process.env.COLOR === 'dark' ? 'dark' : 'light';
const [cookieName, cookieValue] = (process.env.SESSION ?? 'rh_session=dev').split('=');
const only = process.argv.slice(2).map(Number).filter(Boolean);

const slow4g = { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const cpuSlowdown = 4;
/** A step's answer on screen after the tap or key that asked for it; an answer from the API (a fix sent) gets the network's time too. */
const budgets = { tapMs: 300, sendMs: 2500, layoutShift: 0.05 };
const stepTimeout = 30_000;

/**
 * The pages walked: the real ones on the beta; locally, the sample catalog's (`npm run sample`), or with
 * PAGES=fixture the browser tests' stand-in API (e2e/fixture-api.ts, SESSION=rh_session=sample), which
 * takes live fixes and knows who is signed out: the local API with DEV_ACCOUNT signs every request in.
 */
const pages = !local
  ? { sicha: '/likkutei-sichos/31/1/1/1', recording: '/listen/5740/rh-dc0cx5mm', shelf: '/sets/the-rebbe', sefer: '/likkutei-sichos', event: '/listen/5740/rh-dc0cx5mm' }
  : process.env.PAGES === 'fixture'
    ? { sicha: '/sample/1/1', recording: '/listen/5732/rh-3dvjfkyc', shelf: '/sets/the-rebbe', sefer: '/sample-sichos', event: '/listen/5732/rh-3dvjfkyc' }
    : { sicha: '/tanya/1/1', recording: '', shelf: '/sets/the-rebbe', sefer: '/tanya', event: '' };
// The sample farbrengen's id is made afresh each time the sample is loaded: found from its year's page.
if (local && !pages.event) {
  const year = await (await fetch(`${base}/listen/5742`)).text();
  pages.event = pages.recording = year.match(/href="(\/listen\/5742\/rh-[a-z0-9]+)"/)?.[1] ?? '/listen/5742';
}

// On screen: there, with a size, and styled. Before its stylesheet comes the page is not painted, though the
// browser still lays it out (a sicha's first words thousands of pixels down, under an unstyled path bar).
const styled = `[...document.querySelectorAll('link[rel=stylesheet]')].every((l) => l.sheet)`;
const shown = (selector) => `(() => { if (!${styled}) return false; const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const gone = (selector) => `!${shown(selector)}`;
const both = (...checks) => `(${checks.join(' && ')})`;
const bar = '[role=toolbar][aria-label="המילים שסומנו"]';
const sheet = '[role=dialog][aria-label="תיקון"]';
const words = `[...document.querySelectorAll('.torah p')].some((p) => p.textContent.trim().length > 20)`;
const toast = (words) => `[...document.querySelectorAll('[role=status]')].some((e) => e.textContent.includes(${JSON.stringify(words)}))`;

class Walk {
  constructor(page) {
    this.page = page;
    this.steps = [];
    this.errors = [];
    this.notes = [];
    this.sent = [];
    page.on('console', (m) => m.type() === 'error' && this.errors.push(m.text().slice(0, 200)));
    page.on('pageerror', (e) => this.errors.push(`page error: ${String(e.message).slice(0, 200)}`));
    page.on('request', (r) => r.method() === 'POST' && /\/_\/(fix|edit)/.test(r.url()) && this.sent.push(new URL(r.url()).pathname));
    // What the site answered a fix or an edit, when it was not a yes: the walk's report says why a step stopped.
    page.on('response', async (r) => {
      if (r.request().method() !== 'POST' || !/\/_\/(fix|edit)/.test(r.url()) || (r.ok() && !process.env.WALK_DEBUG)) return;
      this.notes.push(`${new URL(r.url()).pathname} answered ${r.status()} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    });
  }

  /** One step: an action, then what it should show, timed from the action. */
  async step(name, action, until, { kind = 'tap' } = {}) {
    const start = performance.now();
    await action();
    await this.page.waitForFunction(until, undefined, { polling: 'raf', timeout: stepTimeout });
    const ms = Math.round(performance.now() - start);
    this.steps.push({ name, kind, ms });
    return ms;
  }

  open(pathname, until) {
    return this.step(`open ${pathname}`, () => this.page.goto(base + pathname, { waitUntil: 'commit' }), until, { kind: 'open' });
  }

  /** Where a person would tap what the locator finds, once it has come to rest (a sheet slides up first). */
  async aim(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`nothing to tap: ${locator}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A real touch tap in the middle of what the locator finds. */
  async touch(locator) {
    const { x, y } = await this.aim(locator);
    await this.page.touchscreen.tap(x, y);
  }

  /** A tap, timed from the finger coming down, not from the wait for the thing to come to rest. */
  async tap(name, locator, until, options) {
    const { x, y } = await this.aim(locator);
    return this.step(name, () => this.page.touchscreen.tap(x, y), until, options);
  }

  /** Selects one whole word in the first block under `selector` that has a few, as a long press leaves it; gives back the word. */
  async select(selector) {
    const word = await this.page.evaluate((selector) => {
      for (const block of document.querySelectorAll(selector)) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement.closest('a, sup')) continue;
          const match = /(?<=\s)[א-ת]{4,}(?=[\s,.])/u.exec(node.textContent);
          if (!match) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          node.parentElement.scrollIntoView({ block: 'center' });
          getSelection().removeAllRanges();
          getSelection().addRange(range);
          return match[0];
        }
      }
      return null;
    }, selector);
    if (!word) throw new Error(`no word to select under ${selector}`);
    return word;
  }

  async shot(name) {
    if (this.shots) await this.page.screenshot({ path: path.join(this.shots, `${this.prefix}-${name}.png`) }).catch(() => {});
  }
}

/** Select a word, see the bar; Fix, see the box with the word; type the fix. Gives back the word. */
async function selectAndFix(w, selector, label) {
  let word;
  await w.step(`select a word in the ${label}`, async () => (word = await w.select(selector)), shown(bar));
  await w.shot('bar');
  // The bar sits clear of the selection, so the phone's own menu (above it) and handles (just under it) stay free.
  const gap = await w.page.evaluate((bar) => {
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    const b = document.querySelector(bar).getBoundingClientRect();
    return Math.round(b.top - r.bottom);
  }, bar);
  w.notes.push(`bar ${gap} px under the selection`);
  await w.tap('Fix', w.page.locator(bar).getByRole('button', { name: 'תקן' }), both(shown(`${sheet} textarea`), `document.activeElement?.id === 'fix-words'`));
  const box = w.page.locator(`${sheet} textarea`);
  const value = await box.inputValue();
  if (value !== word) throw new Error(`the box holds "${value}", not the selected "${word}"`);
  const was = await w.page.locator(`${sheet} .was q`).textContent();
  if (was !== word) throw new Error(`the sheet says it replaces "${was}", not "${word}"`);
  await box.fill(`${word}ה`);
  await w.shot('sheet');
  return word;
}

/**
 * Save: live at once (the toast says it is fixed, with Undo), or sent for a second look, as the API decides.
 * Gives back whether it went live; one that waits is noted with the API's reason.
 */
async function save(w) {
  let reason = '';
  const listen = async (r) => {
    if (r.request().method() === 'POST' && r.url().endsWith('/_/fix')) reason = (await r.json().catch(() => ({}))).reason ?? '';
  };
  w.page.on('response', listen);
  await w.tap('Save', w.page.locator(sheet).getByRole('button', { name: 'שמירה' }), `(${toast('תוקן')}) || (${toast('נשלח')})`, { kind: 'send' });
  w.page.off('response', listen);
  await w.shot('saved');
  const live = await w.page.evaluate(toast('תוקן'));
  if (!live) w.notes.push(`not live: sent for a second look${reason ? ` (${reason})` : ''}, so there was no Undo to walk`);
  return live;
}

const tasks = [
  {
    n: 1,
    slug: 'sicha',
    name: 'A sicha: select a word, Fix, type, live, Undo',
    signedIn: true,
    async run(w) {
      await w.open(pages.sicha, both(shown('main h1'), words));
      const word = await selectAndFix(w, '.torah [id^="s-"]', 'text');
      if (!local) return w.notes.push('stopped before Save: nothing was sent');
      if (!(await save(w))) return;
      const fixed = await w.page.locator('.torah .fixed').textContent();
      if (fixed !== `${word}ה`) throw new Error(`the page shows "${fixed}" after the fix`);
      await w.tap('Undo', w.page.getByRole('status').getByRole('button', { name: 'בטל' }), both(toast('בוטל'), gone('.torah .fixed')), { kind: 'send' });
    },
  },
  {
    n: 2,
    slug: 'transcript',
    name: "A recording's transcript: select a word, Fix, type, live, Undo",
    signedIn: true,
    async run(w) {
      await w.open(pages.recording, both(shown('main h1'), shown('[id^="w-"]')));
      const word = await selectAndFix(w, '[id^="w-"]', 'transcript');
      if (!local) return w.notes.push('stopped before Save: nothing was sent');
      if (!(await save(w))) return;
      const shows = await w.page.locator('[id^="w-"]').evaluateAll((list, word) => list.some((p) => p.textContent.includes(word)), `${word}ה`);
      if (!shows) throw new Error('the transcript does not show the fix');
      await w.tap('Undo', w.page.getByRole('status').getByRole('button', { name: 'בטל' }), toast('בוטל'), { kind: 'send' });
    },
  },
  {
    n: 3,
    slug: 'sign-in',
    name: 'Signed out: Fix asks to sign in, and the words are there after it',
    // The local API with DEV_ACCOUNT takes every request as signed in: signed out is walked on the stand-in API.
    skip: local && process.env.PAGES !== 'fixture',
    async run(w, context) {
      await w.open(pages.sicha, both(shown('main h1'), words));
      const word = await selectAndFix(w, '.torah [id^="s-"]', 'text');
      if (!local) return w.notes.push('stopped before Save: nothing was sent');
      await w.tap('Save, asked to sign in', w.page.locator(sheet).getByRole('button', { name: 'שמירה' }), shown(`${sheet} a[href^="/signin"]`), { kind: 'send' });
      await w.shot('signin');
      await w.tap('Sign in', w.page.locator(sheet).getByRole('link', { name: 'כניסה' }), both(`location.pathname === '/signin'`, shown('main h1')));
      // Signing in itself (a passkey, Google or an email link) is the person's, outside the walk: it ends where the sign-in page sends them back.
      const back = new URL(w.page.url()).searchParams.get('return');
      if (back !== pages.sicha) throw new Error(`sign-in returns to ${back}`);
      await context.addCookies([{ name: cookieName, value: cookieValue, url: base }]);
      await w.step('back from signing in', () => w.page.goto(base + back, { waitUntil: 'commit' }), shown(`${sheet} textarea`), { kind: 'open' });
      const kept = await w.page.locator(`${sheet} textarea`).inputValue();
      if (kept !== `${word}ה`) throw new Error(`the box holds "${kept}" after signing in`);
      await w.shot('kept');
      if (!(await save(w))) return;
      await w.tap('Undo', w.page.getByRole('status').getByRole('button', { name: 'בטל' }), both(toast('בוטל'), gone('.torah .fixed')), { kind: 'send' });
    },
  },
  ...['shelf', 'sefer', 'event'].map((kind, i) => ({
    n: 4 + i,
    slug: `edit-${kind}`,
    name: `Edit on ${kind === 'event' ? 'an event' : `a ${kind}`}: open it, change the English name, done`,
    signedIn: true,
    async run(w) {
      await w.open(pages[kind], shown('main h1'));
      await w.tap('More', w.page.getByRole('button', { name: 'עוד', exact: true }), shown('.sheet.on'));
      await w.tap('Edit', w.page.locator('.sheet.on').getByRole('button', { name: 'עריכה' }), both(`location.search.includes('edit')`, shown('.editbar'), shown('#f-name-he')));
      await w.shot('edit');
      const field = w.page.locator('#f-name-en');
      const was = await field.inputValue();
      if (local) {
        await w.touch(field);
        await field.fill(`${was} (walk)`);
        await w.step('Enter, saved', () => w.page.keyboard.press('Enter'), toast('נשמר'), { kind: 'send' });
        await w.shot('saved');
        // Put back as it was, so each run starts the same.
        await w.touch(field);
        await field.fill(was);
        await w.step('put back', () => w.page.keyboard.press('Enter'), `(${toast('נשמר')}) && !document.querySelector('#f-name-en').disabled`, { kind: 'send' });
      } else w.notes.push('no field changed: nothing was sent');
      await w.tap('Done', w.page.locator('.editbar').getByRole('link', { name: 'סיום' }), both(`!location.search.includes('edit')`, gone('.editbar')));
    },
  })),
];

async function runOnce(browser, task, run, shots) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', colorScheme });
  if (task.signedIn && local) await context.addCookies([{ name: cookieName, value: cookieValue, url: base }]);
  await context.addInitScript(() => {
    try {
      let total = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
        window.__walkShift = total;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });
  const page = await context.newPage();
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', slow4g);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  }
  const walk = new Walk(page);
  walk.shots = shots;
  walk.prefix = `${task.n}-${task.slug}-${colorScheme}`;
  const started = performance.now();
  let why = '';
  try {
    await task.run(walk, context);
  } catch (error) {
    why = String(error.message ?? error).split('\n')[0].slice(0, 240);
    // What the page held when the walk stopped: the step it waited in, and the selection and bar, for the report.
    const held = await page.evaluate((bar) => ({ selected: String(getSelection()).slice(0, 40), bar: !!document.querySelector(bar), at: location.pathname + location.search }), bar).catch(() => null);
    if (held) why += ` (after "${walk.steps.at(-1)?.name ?? 'the start'}"; selected "${held.selected}", bar ${held.bar ? 'shown' : 'not shown'}, at ${decodeURI(held.at)})`;
    await walk.shot('stopped');
  }
  const shift = await page.evaluate(() => window.__walkShift ?? 0).catch(() => 0);
  await context.close();
  if (!local && walk.sent.length) throw new Error(`the walk sent ${walk.sent.join(', ')} to ${base}`);
  return { run, finished: !why, why, totalMs: Math.round(performance.now() - started), steps: walk.steps, notes: walk.notes, errors: [...new Set(walk.errors)], shift: Number(shift.toFixed(3)), sent: walk.sent };
}

const fmt = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)} s` : '–');
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) / 2)];

function summarize(task, results) {
  const done = results.filter((r) => r.finished);
  const pool = done.length ? done : results;
  const mid = [...pool].sort((a, b) => a.totalMs - b.totalMs)[Math.floor((pool.length - 1) / 2)];
  // Each step's median over the runs that got that far.
  const steps = mid.steps.map((s) => ({ ...s, ms: median(pool.map((r) => r.steps.find((x) => x.name === s.name)?.ms).filter(Number.isFinite)) }));
  const misses = [];
  if (done.length < results.length) misses.push(`stopped in ${results.length - done.length} of ${results.length} runs: ${results.find((r) => !r.finished).why}`);
  for (const s of steps) {
    if (s.kind === 'tap' && s.ms > budgets.tapMs) misses.push(`${s.name} ${s.ms} ms > ${budgets.tapMs}`);
    if (s.kind === 'send' && s.ms > budgets.sendMs) misses.push(`${s.name} ${s.ms} ms > ${budgets.sendMs}`);
  }
  if (mid.shift > budgets.layoutShift) misses.push(`layout shift ${mid.shift}`);
  if (mid.errors.length) misses.push(`${mid.errors.length} console errors`);
  return { n: task.n, slug: task.slug, name: task.name, finishedRuns: done.length, runs: results.length, median: { ...mid, steps }, misses };
}

function report(summary, meta) {
  const lines = [
    `# Fix and Edit walk, ${meta.date}`,
    '',
    `${meta.base}${local ? ' (local, reading a local API: fixes and edits sent)' : ' (read-only: stopped before Save)'}, a phone 390 px wide with touch, ${colorScheme}, ${throttle ? 'slow 4G and a 4x slower CPU' : 'no throttling'}, ${runs} runs per task from a fresh profile; the median of each step.`,
    `Budgets: an answer on screen ${budgets.tapMs} ms after a tap, ${budgets.sendMs} ms after Save or Undo (the API's round trip on slow 4G), layout shift < ${budgets.layoutShift}, no console errors.`,
    '',
    '| # | Task | Done | Steps (median) | Whole task | Shift | Within budget |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const s of summary) {
    const m = s.median;
    lines.push(`| ${s.n} | ${s.name} | ${s.finishedRuns}/${s.runs} | ${m.steps.map((x) => `${x.name} ${fmt(x.ms)}`).join('; ')} | ${fmt(m.totalMs)} | ${m.shift} | ${s.misses.length ? `no: ${s.misses.join('; ')}` : 'yes'} |`);
  }
  lines.push('');
  for (const s of summary) {
    const notes = [...s.median.notes, ...s.median.errors.map((e) => `console: ${e}`), ...(s.median.why ? [`stopped: ${s.median.why}`] : [])];
    if (notes.length) lines.push(`- ${s.n}. ${notes.join('; ')}`);
  }
  return lines.join('\n');
}

const shots = path.join(out, 'shots');
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const summary = [];
for (const task of tasks.filter((t) => !t.skip && (!only.length || only.includes(t.n)))) {
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const result = await runOnce(browser, task, run, run === 1 ? shots : null);
    results.push(result);
    console.log(`${task.n}. ${task.slug} run ${run}: ${result.finished ? 'done' : `stopped (${result.why})`} in ${fmt(result.totalMs)}`);
  }
  summary.push(summarize(task, results));
}
await browser.close();
const meta = { date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', base, runs, throttle, colorScheme, budgets };
writeFileSync(path.join(out, 'results.json'), JSON.stringify({ meta, summary }, null, 2));
writeFileSync(path.join(out, 'report.md'), report(summary, meta));
console.log(`\n${path.join(out, 'report.md')}`);
