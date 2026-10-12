// The top-task walk: ten everyday tasks done on the site as a person on a phone
// would, each measured, so Flow can rerun it after every change (issue #245).
//
// A phone 390 px wide on slow 4G with a 4x slower CPU. Every run starts a fresh
// browser profile (nothing cached, no service worker yet), and each task runs
// three times; the report gives the median run.
//
// Read-only: the walk never sends a fix, a report, a suggestion or a sign-in.
// Task 9 opens the Fix sheet and types, and stops before Save.
//
// Usage: npm run walk:top-tasks -w apps/www [-- <task numbers>], or from apps/www: npm run walk:top-tasks
//   BASE_URL      the site (default https://new.chassidushub.org)
//   CHROMIUM_PATH a Chromium already on the machine instead of Playwright's own
//   RUNS          runs per task (default 3)
//   OUT           where results.json, report.md and the screenshots go (default top-tasks)
//   THROTTLE=off  no network or CPU slowdown, to check the walk itself quickly
//   THINK_MS      how long the person looks at a page before tapping on (default 1000)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';

const base = (process.env.BASE_URL ?? 'https://new.chassidushub.org').replace(/\/$/, '');
const runs = Number(process.env.RUNS ?? 3);
const out = process.env.OUT ?? 'top-tasks';
const throttle = process.env.THROTTLE !== 'off';
const think = Number(process.env.THINK_MS ?? 1000);
const only = process.argv.slice(2).map(Number).filter(Boolean);

/**
 * Slow 4G as Lighthouse and Chrome's DevTools throttle it (150 ms round trip and
 * 1.6 Mb/s, with DevTools' factors for packet-level throttling), and a 4x slower CPU.
 */
const slow4g = { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 };
const cpuSlowdown = 4;

/**
 * The budgets the walk checks each task against.
 * - The frame of a page drawn after a tap inside the site: at once (the instant-pages
 *   rule), which the walk takes as 300 ms. A page opened from outside the site,
 *   with nothing cached, has to cross the network first: 1.8 s, the "good" first paint.
 * - The content of each step: 1.5 s after the tap or key that asked for it.
 * - A catalog task: 4 taps at most. Layout shift under 0.05 on every page. No console errors.
 */
const budgets = { tapFrameMs: 300, openFrameMs: 1800, contentMs: 1500, catalogTaps: 4, layoutShift: 0.05, consoleErrors: 0 };
const stepTimeout = 30_000;

/** Records the page's layout shifts and when audio really starts playing, on every page the walk opens. */
const pageScript = () => {
  try {
    const key = `walk.cls.${Math.round(performance.timeOrigin)}`;
    let total = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
      sessionStorage.setItem(key, JSON.stringify({ path: location.pathname, total }));
    }).observe({ type: 'layout-shift', buffered: true });
    // The longest time the page could not answer a tap or a key: its longest task on the main thread.
    let longest = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longest = Math.max(longest, entry.duration);
      sessionStorage.setItem(key.replace('cls', 'block'), JSON.stringify({ path: location.pathname, longest: Math.round(longest) }));
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const media = this;
    const heard = () => {
      if (media.currentTime > 0 && !window.__walkPlaying) window.__walkPlaying = { at: performance.now(), src: media.currentSrc };
    };
    media.addEventListener('timeupdate', heard);
    media.addEventListener('error', () => (window.__walkMediaError = media.error?.code ?? 'error'));
    return play.apply(this, args);
  };
};

/** One run of one task: the person's taps and keys, and what the site did. */
class Walk {
  constructor(page, cdp) {
    this.page = page;
    this.cdp = cdp;
    this.taps = 0;
    this.keys = 0;
    this.steps = [];
    this.requests = 0;
    this.bytes = 0;
    this.errors = [];
    this.failed = [];
    this.notes = [];
    page.on('console', (m) => m.type() === 'error' && this.errors.push(m.text().slice(0, 200)));
    page.on('pageerror', (e) => this.errors.push(`page error: ${String(e.message).slice(0, 200)}`));
    page.on('response', (r) => r.status() >= 400 && this.failed.push(`${r.status()} ${r.url().replace(base, '')}`));
    page.on('response', (r) => r.request().resourceType() === 'media' && r.status() < 400 && (this.audioAt ??= performance.now()));
    cdp.on('Network.requestWillBeSent', () => this.requests++);
    cdp.on('Network.loadingFinished', (e) => (this.bytes += e.encodedDataLength));
  }

  /**
   * One step: an action, then the step's frame and its content. Both are timed from
   * the action. `frame` and `content` are expressions run in the page each frame
   * until they are true, or a function run here that resolves with the moment it
   * saw what it waits for. `kind` is 'open' for a page opened from outside the site.
   * With `again`, a person who sees nothing happen within a second and a half does
   * it again (a button tapped before the page's scripts have come does nothing).
   */
  async step(name, action, { frame, content, arg, kind = 'tap', again = false }) {
    const start = performance.now();
    await action();
    const acted = performance.now();
    const step = { name, kind, actionMs: Math.round(acted - start), tries: 1 };
    this.steps.push(step);
    const wait = async (check, timeout = stepTimeout) => {
      if (typeof check === 'function') return Math.round((await check()) - start);
      await this.page.waitForFunction(check, arg, { polling: 'raf', timeout });
      return Math.round(performance.now() - start);
    };
    if (again && typeof (frame ?? content) !== 'function') {
      while (!step.frameMs) {
        step.frameMs = await wait(frame ?? content, 1500).catch(() => null);
        if (step.frameMs) break;
        if (performance.now() - start > stepTimeout) throw new Error(`nothing happened after ${step.tries} taps`);
        step.tries++;
        // The first tap may have taken the person elsewhere (a link without its script); then there is nothing to tap again.
        await action().catch(() => {});
      }
    } else step.frameMs = await wait(frame ?? content);
    step.contentMs = await wait(content);
  }

  /** Opens a path as if typed in the address bar or followed from outside. */
  open(pathname, { frame, content, arg }) {
    return this.step(`open ${pathname}`, () => this.page.goto(base + pathname, { waitUntil: 'commit' }), { frame, content, arg, kind: 'open' });
  }

  /** A tap that leads somewhere, after a moment's look: counted, then timed like any step. */
  async tap(name, locator, wait) {
    let tapped = false;
    // A person looks at what came before tapping on; the time is not counted.
    await this.page.waitForTimeout(think);
    return this.step(name, async () => {
      // Again: only if the thing is still there to tap.
      if (tapped && !(await locator.isVisible())) return;
      tapped = true;
      this.taps++;
      await locator.tap({ timeout: stepTimeout });
    }, wait);
  }

  /**
   * When the recording is heard: the moment it plays, or, in a Chromium that cannot
   * decode AAC (Playwright's own), the moment its first bytes arrive.
   */
  async audio() {
    const until = performance.now() + stepTimeout;
    while (performance.now() < until) {
      if (this.audioAt) return this.audioAt;
      if (await this.page.evaluate(() => !!window.__walkPlaying).catch(() => false)) return performance.now();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the recording never started');
  }

  /** Typing into the field that has focus; every letter is a keystroke. */
  async type(text) {
    this.keys += [...text].length;
    await this.page.keyboard.type(text);
  }

  /** Enter (one keystroke), timed like a step. */
  enter(name, wait) {
    return this.step(name, async () => {
      this.keys++;
      await this.page.keyboard.press('Enter');
    }, wait);
  }

  /** The longest main-thread task of any page the run opened. */
  async longestBlock() {
    const all = await this.page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('walk.block.')).map((k) => JSON.parse(sessionStorage.getItem(k)))).catch(() => []);
    const worst = all.reduce((a, b) => (b.longest > a.longest ? b : a), { longest: 0, path: '' });
    return { ms: worst.longest, path: worst.path };
  }

  /** The worst layout shift of any page the run opened. */
  async layoutShift() {
    const all = await this.page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('walk.cls.')).map((k) => JSON.parse(sessionStorage.getItem(k)))).catch(() => []);
    const worst = all.reduce((a, b) => (b.total > a.total ? b : a), { total: 0, path: '' });
    return { value: Number(worst.total.toFixed(3)), path: worst.path };
  }
}

// What the page shows, checked in the page. Each returns true once it is on screen.
const shown = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const both = (...checks) => `(${checks.join(' && ')})`;
const at = (pathname) => `(location.pathname === ${JSON.stringify(pathname)})`;
const atStart = (prefix) => `location.pathname.startsWith(${JSON.stringify(prefix)})`;
const frame = shown('header, [role=banner]');
const pageFrame = both(frame, shown('main h1, article h1'));
/** The words of the text at this address (not the page before it, still on screen while the next one comes): a paragraph with words in it. */
const words = `[...document.querySelectorAll('.torah[data-html="body:' + decodeURI(location.pathname) + '"] p, .torah[data-html="body:' + location.pathname + '"] p')].some((p) => p.textContent.trim().length > 20)`;
/** The person's view and the item they are reading are the one the step asked for. */
const reading = (pathname) => both(at(pathname), words);
const pathBar = (page) => page.locator('nav[aria-label="המקום באתר"]');
const link = (page, href) => page.locator(`main a[href="${href}"]`).first();
const sheet = (page) => page.locator('.sheet.on');

/** Selects a word in the text as a long press would, which is one tap. */
async function longPress(walk, selector, word) {
  walk.taps++;
  await walk.page.evaluate(([selector, word]) => {
    const root = document.querySelector(selector);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent.indexOf(word);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + word.length);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error(`no "${word}" in ${selector}`);
  }, [selector, word]);
}

const sicha = '/likkutei-sichos/31/1/1/1';

/** The ten tasks. `catalog` marks the tasks held to the four-tap budget. */
const tasks = [
  {
    n: 1,
    slug: 'play-latest',
    name: "Open the home page and play the Rebbe's latest recording",
    async run(w) {
      await w.open('/', { frame: pageFrame, content: shown('main button[aria-label^="לנגן"]') });
      await w.tap('play the first recording', w.page.locator('main button[aria-label^="לנגן"]').first(), {
        frame: shown('button[aria-label^="פתיחת הנגן"]'),
        content: () => w.audio(),
        again: true,
      });
      const media = await w.page.evaluate(() => ({ playing: window.__walkPlaying, error: window.__walkMediaError }));
      w.notes.push(media.playing ? `heard ${String(media.playing.src).slice(0, 100)}` : `first audio bytes arrived${media.error ? ` (this Chromium cannot decode the file, media error ${media.error})` : ''}`);
    },
  },
  {
    n: 2,
    slug: 'maamar-by-dh',
    name: 'Find a maamar by its opening words (ד"ה) with search',
    async run(w) {
      await w.open('/', { frame: pageFrame, content: shown('main input[type=search]') });
      w.taps++;
      await w.page.locator('main input[type=search]').tap();
      await w.type('באתי לגני');
      await w.enter('search for באתי לגני', {
        frame: both(atStart('/search'), shown('main h1')),
        content: shown('main a[href^="/sefer-hamaamarim-melukat/"]'),
      });
      const first = w.page.locator('main a[href^="/sefer-hamaamarim-melukat/"]').first();
      const href = await first.getAttribute('href');
      await w.tap('open the maamar', first, { frame: both(at(href.replace(/#.*/, '')), pageFrame), content: words });
    },
  },
  {
    n: 3,
    slug: 'library-to-sicha',
    name: 'Go from the library to Likkutei Sichos, a volume, a sicha',
    catalog: true,
    async run(w) {
      await w.open('/library', { frame: pageFrame, content: shown('main a[href="/sets/the-rebbe"]') });
      await w.tap('the Rebbe', link(w.page, '/sets/the-rebbe'), { frame: both(at('/sets/the-rebbe'), pageFrame), content: shown('main a[href="/sets/the-rebbe-likkutei-sichos"]') });
      await w.tap('Likkutei Sichos', link(w.page, '/sets/the-rebbe-likkutei-sichos'), { frame: both(at('/likkutei-sichos'), pageFrame), content: shown('main a[href="/likkutei-sichos/31"]') });
      await w.tap('volume 31', link(w.page, '/likkutei-sichos/31'), { frame: both(at('/likkutei-sichos/31'), pageFrame), content: shown(`main a[href="${sicha}"]`) });
      await w.tap('the first sicha', link(w.page, sicha), { frame: both(at(sicha), pageFrame), content: words });
    },
  },
  {
    n: 4,
    slug: 'footnote-and-back',
    name: 'In a sicha, open a footnote and come back to the same place',
    async run(w) {
      await w.open(sicha, { frame: pageFrame, content: words });
      const mark = w.page.locator('.torah a.nm').nth(2);
      await mark.scrollIntoViewIfNeeded();
      const before = await mark.evaluate((e) => Math.round(e.getBoundingClientRect().top));
      await w.tap('open footnote 3', mark, { frame: shown('.sheet.on'), content: both(shown('.sheet.on .notetext'), `document.querySelector('.sheet.on .notetext').textContent.trim().length > 0`), again: true });
      const hash = await w.page.evaluate(() => location.hash);
      if (hash) w.notes.push(`the first tap, before the page's script had come, jumped to ${hash} at the end of the page`);
      await w.tap('close the footnote', sheet(w.page).getByRole('button', { name: 'סגירה' }), { content: `!document.querySelector('.sheet.on')` });
      const after = await mark.evaluate((e) => Math.round(e.getBoundingClientRect().top));
      w.notes.push(`footnote mark at ${before} px before, ${after} px after`);
      if (Math.abs(after - before) > 8) throw new Error(`came back to a different place: the mark moved ${after - before} px`);
    },
  },
  {
    n: 5,
    slug: 'next-with-path-bar',
    name: 'Move to the next sicha with the path bar',
    catalog: true,
    async run(w) {
      await w.open(sicha, { frame: pageFrame, content: words });
      await w.tap('the sicha in the path bar', pathBar(w.page).getByRole('button', { name: 'שיחה א', exact: true }), { content: shown('.sheet.on [role=menu]'), again: true });
      await w.tap('שיחה ב', sheet(w.page).getByRole('menuitemradio', { name: /^שיחה ב / }), {
        frame: both(`!location.pathname.startsWith('/likkutei-sichos/31/1/1/')`, pageFrame),
        content: both(`location.pathname.startsWith('/likkutei-sichos/31/1/2')`, words),
      });
    },
  },
  {
    n: 6,
    slug: 'farbrengen-by-date',
    name: "Find a farbrengen in Toras Menachem by its year and date (י\"ט כסלו תשכ\"ב)",
    catalog: true,
    async run(w) {
      await w.open('/library', { frame: pageFrame, content: shown('main a[href="/sets/the-rebbe"]') });
      await w.tap('the Rebbe', link(w.page, '/sets/the-rebbe'), { frame: both(at('/sets/the-rebbe'), pageFrame), content: shown('main a[href="/sets/the-rebbe-sichos"]') });
      await w.tap('Toras Menachem and sichos', link(w.page, '/sets/the-rebbe-sichos'), { frame: both(at('/sets/the-rebbe-sichos'), pageFrame), content: shown('main a[href="/toras-menachem"]') });
      await w.tap('Toras Menachem', link(w.page, '/toras-menachem'), { frame: both(at('/toras-menachem'), pageFrame), content: shown('main a[href="/toras-menachem/32"]') });
      await w.tap('volume 32, תשכ"ב', link(w.page, '/toras-menachem/32'), { frame: both(at('/toras-menachem/32'), pageFrame), content: shown('main a[href^="/toras-menachem/32/"]') });
      const day = w.page.locator('main a[href^="/toras-menachem/32/"]').filter({ hasText: /^בס"ד\. י"ט כסלו, ה'תשכ"ב$/ }).first();
      const href = await day.getAttribute('href');
      await w.tap('י"ט כסלו', day, { frame: both(at(href), pageFrame), content: words });
    },
  },
  {
    n: 7,
    slug: 'letter-by-number',
    name: "Find a letter in Igros Kodesh by volume and number (vol. 5, letter א'רנ)",
    catalog: true,
    async run(w) {
      await w.open('/library', { frame: pageFrame, content: shown('main a[href="/sets/the-rebbe"]') });
      await w.tap('the Rebbe', link(w.page, '/sets/the-rebbe'), { frame: both(at('/sets/the-rebbe'), pageFrame), content: shown('main a[href="/sets/the-rebbe-igros-kodesh"]') });
      await w.tap('Igros Kodesh (shelf)', link(w.page, '/sets/the-rebbe-igros-kodesh'), { frame: both(at('/sets/the-rebbe-igros-kodesh'), pageFrame), content: shown('main a[href="/igros-kodesh-rebbe"]') });
      await w.tap('Igros Kodesh', link(w.page, '/igros-kodesh-rebbe'), { frame: both(at('/igros-kodesh-rebbe'), pageFrame), content: shown('main a[href="/igros-kodesh-rebbe/5"]') });
      await w.tap('volume 5', link(w.page, '/igros-kodesh-rebbe/5'), { frame: both(at('/igros-kodesh-rebbe/5'), pageFrame), content: shown('main a[href^="/igros-kodesh-rebbe/5/"]') });
      const letter = w.page.locator('main a[href^="/igros-kodesh-rebbe/5/"]').filter({ hasText: /^אגרת א'רנ$/ }).first();
      const href = await letter.getAttribute('href');
      await w.tap("letter א'רנ", letter, { frame: both(at(href), pageFrame), content: words });
    },
  },
  {
    n: 8,
    slug: 'tanya-by-name',
    name: 'Find a sefer by name (Tanya) with search',
    async run(w) {
      await w.open('/', { frame: pageFrame, content: shown('main input[type=search]') });
      w.taps++;
      await w.page.locator('main input[type=search]').tap();
      await w.type('תניא');
      await w.enter('search for תניא', { frame: both(atStart('/search'), shown('main h1')), content: shown('main a[href="/tanya"]') });
      const top = await w.page.getByRole('region', { name: 'התשובה' }).getByRole('link').first().getAttribute('href', { timeout: 2000 }).catch(() => null);
      w.notes.push(`top answer: ${top ?? 'none'}`);
      if (top !== '/tanya') w.notes.push('Tanya itself is not the top answer');
      await w.tap('Tanya', link(w.page, '/tanya'), { frame: both(at('/tanya'), pageFrame), content: shown('main a, main .torah p') });
    },
  },
  {
    n: 9,
    slug: 'fix-a-word',
    name: 'Fix a word: select it, Fix, type (stopped before sending)',
    async run(w) {
      await w.open(sicha, { frame: pageFrame, content: words });
      // A person who sees no bar presses again; each press is a tap.
      await w.step('select a word', async () => {}, {
        content: async () => {
          const bar = w.page.locator('[role=toolbar][aria-label="המילים שסומנו"]');
          for (let tries = 0; tries < 30; tries++) {
            await longPress(w, '#s-p2', 'לחבול');
            if (await bar.waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)) return performance.now();
          }
          throw new Error('the Fix bar never came');
        },
      });
      await w.tap('Fix', w.page.getByRole('toolbar', { name: 'המילים שסומנו' }).getByRole('button', { name: 'תקן' }), {
        content: shown('[role=dialog][aria-label="תיקון"] textarea, [role=dialog][aria-label="תיקון"] input'),
      });
      const box = w.page.getByRole('dialog', { name: 'תיקון' }).getByLabel('המילים הנכונות');
      await box.fill('');
      await w.type('לחבל');
      const value = await box.inputValue();
      if (value !== 'לחבל') throw new Error(`the box holds "${value}"`);
      w.notes.push('stopped before Save: nothing was sent');
    },
  },
  {
    n: 10,
    slug: 'reopen-offline',
    name: 'Reopen a sicha read earlier, then again offline',
    async run(w, context) {
      const earlier = '/likkutei-sichos/31/1/1/3';
      await w.open(earlier, { frame: pageFrame, content: words });
      await w.page.waitForTimeout(2000); // a person reads a little, and the service worker settles
      await w.open('/', { frame: pageFrame, content: shown(`main a[href="${earlier}"]`) });
      await w.tap('continue reading', link(w.page, earlier), { frame: both(at(earlier), pageFrame), content: words });
      await context.setOffline(true);
      await w.step('reopen offline', () => w.page.reload({ waitUntil: 'commit' }).catch(() => {}), { frame: pageFrame, content: reading(earlier), kind: 'open' });
    },
  },
];

async function runOnce(browser, task, run, shots) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', colorScheme: 'light' });
  await context.addInitScript(pageScript);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (throttle) {
    await cdp.send('Network.emulateNetworkConditions', slow4g);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
  }
  const walk = new Walk(page, cdp);
  const started = performance.now();
  let finished = true;
  let why = '';
  try {
    await task.run(walk, context);
  } catch (error) {
    finished = false;
    why = String(error.message ?? error).split('\n')[0].slice(0, 240);
    const where = await page.evaluate(() => [location.pathname, document.querySelector('main h1')?.textContent ?? '', /ERR_INTERNET_DISCONNECTED/.test(document.body?.innerText ?? '')]).catch(() => null);
    if (where?.[2]) why += ` (the browser's own "No internet" page for ${new URL(page.url()).pathname})`;
    else if (where) why += ` (at ${decodeURI(where[0])}${where[1] ? `, "${where[1].trim().slice(0, 60)}"` : ''})`;
  }
  const totalMs = Math.round(performance.now() - started);
  await context.setOffline(false).catch(() => {});
  const shift = await walk.layoutShift();
  const block = await walk.longestBlock();
  if (shots) await page.screenshot({ path: path.join(shots, `${String(task.n).padStart(2, '0')}-${task.slug}.png` ) }).catch(() => {});
  await context.close();
  const opens = walk.steps.filter((s) => s.kind === 'open');
  const taps = walk.steps.filter((s) => s.kind !== 'open');
  const worst = (list, key) => (list.length ? Math.max(...list.map((s) => s[key] ?? Infinity)) : null);
  return {
    run,
    finished,
    why,
    totalMs,
    openFrameMs: worst(opens, 'frameMs'),
    tapFrameMs: worst(taps, 'frameMs'),
    contentMs: worst(walk.steps, 'contentMs'),
    taps: walk.taps,
    keys: walk.keys,
    layoutShift: shift.value,
    layoutShiftPage: shift.path,
    longestBlockMs: block.ms,
    longestBlockPage: block.path,
    requests: walk.requests,
    kB: Math.round(walk.bytes / 1024),
    consoleErrors: [...new Set(walk.errors)],
    failedResponses: [...new Set(walk.failed)],
    notes: walk.notes,
    steps: walk.steps,
  };
}

const median = (values) => {
  const list = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  return list.length ? list[Math.floor((list.length - 1) / 2)] : null;
};

/** The median run of a task: the run whose total time is the median one, so its numbers belong together. */
function summarize(task, results) {
  const done = results.filter((r) => r.finished);
  const pool = done.length ? done : results;
  const mid = [...pool].sort((a, b) => a.totalMs - b.totalMs)[Math.floor((pool.length - 1) / 2)];
  const misses = [];
  if (done.length < results.length) misses.push(`could not finish in ${results.length - done.length} of ${results.length} runs`);
  if (Number.isFinite(mid.openFrameMs) && mid.openFrameMs > budgets.openFrameMs) misses.push(`first frame ${mid.openFrameMs} ms > ${budgets.openFrameMs}`);
  if (Number.isFinite(mid.tapFrameMs) && mid.tapFrameMs > budgets.tapFrameMs) misses.push(`frame after a tap ${mid.tapFrameMs} ms > ${budgets.tapFrameMs}`);
  if (Number.isFinite(mid.contentMs) && mid.contentMs > budgets.contentMs) misses.push(`content ${mid.contentMs} ms > ${budgets.contentMs}`);
  if (task.catalog && mid.taps > budgets.catalogTaps) misses.push(`${mid.taps} taps > ${budgets.catalogTaps}`);
  if (mid.layoutShift > budgets.layoutShift) misses.push(`layout shift ${mid.layoutShift} on ${mid.layoutShiftPage}`);
  if (mid.consoleErrors.length > budgets.consoleErrors) misses.push(`${mid.consoleErrors.length} console errors`);
  return { n: task.n, slug: task.slug, name: task.name, catalog: !!task.catalog, finishedRuns: done.length, runs: results.length, median: mid, misses, all: results };
}

const fmt = (ms) => (ms === null || ms === undefined || !Number.isFinite(ms) ? '–' : `${(ms / 1000).toFixed(2)} s`);

function report(summary, meta) {
  const lines = [
    `# Top-task walk, ${meta.date}`,
    '',
    `${meta.base}, a phone 390 px wide, ${meta.throttle ? 'slow 4G (562 ms, 1.4 Mb/s) and a 4x slower CPU' : 'no throttling'}, ${meta.runs} runs per task from a fresh profile, ${meta.think} ms looking at each page before a tap (not counted); the median run.`,
    `Budgets: frame after a tap ≤ ${budgets.tapFrameMs} ms, first frame of a page opened cold ≤ ${budgets.openFrameMs} ms, content ≤ ${budgets.contentMs} ms per step, ≤ ${budgets.catalogTaps} taps for a catalog task, layout shift < ${budgets.layoutShift}, no console errors.`,
    '',
    '| # | Task | Done | First frame | Frame after tap | Content (worst step) | Whole task | Taps | Keys | Shift | Longest block | Requests | kB | Console errors | Within budget |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const s of summary) {
    const m = s.median;
    lines.push(`| ${s.n} | ${s.name} | ${s.finishedRuns}/${s.runs} | ${fmt(m.openFrameMs)} | ${fmt(m.tapFrameMs)} | ${fmt(m.contentMs)} | ${fmt(m.totalMs)} | ${m.taps} | ${m.keys} | ${m.layoutShift} | ${fmt(m.longestBlockMs)} | ${m.requests} | ${m.kB} | ${m.consoleErrors.length} | ${s.misses.length ? `no: ${s.misses.join('; ')}` : 'yes'} |`);
  }
  lines.push('', '## Steps of the median run', '');
  for (const s of summary) {
    lines.push(`### ${s.n}. ${s.name}`, '');
    if (!s.median.finished) lines.push(`Stopped: ${s.median.why}`, '');
    for (const step of s.median.steps) lines.push(`- ${step.name}: frame ${fmt(step.frameMs)}, content ${fmt(step.contentMs)}${step.tries > 1 ? ` (tapped ${step.tries} times before it answered)` : ''}`);
    for (const note of s.median.notes) lines.push(`- note: ${note}`);
    for (const e of s.median.consoleErrors) lines.push(`- console: ${e}`);
    for (const f of s.median.failedResponses) lines.push(`- failed: ${f}`);
    lines.push('');
  }
  return lines.join('\n');
}

const shots = path.join(out, 'shots');
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const summary = [];
for (const task of tasks.filter((t) => !only.length || only.includes(t.n))) {
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const result = await runOnce(browser, task, run, run === 1 ? shots : null);
    results.push(result);
    console.log(`${task.n}. ${task.slug} run ${run}: ${result.finished ? 'done' : `stopped (${result.why})`} in ${fmt(result.totalMs)}, content ${fmt(result.contentMs)}, ${result.taps} taps`);
  }
  summary.push(summarize(task, results));
}
await browser.close();
const meta = { date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', base, runs, throttle, think, budgets };
writeFileSync(path.join(out, 'results.json'), JSON.stringify({ meta, summary }, null, 2));
writeFileSync(path.join(out, 'report.md'), report(summary, meta));
console.log(`\n${path.join(out, 'report.md')}`);
