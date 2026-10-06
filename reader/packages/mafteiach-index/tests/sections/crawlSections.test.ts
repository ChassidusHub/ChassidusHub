import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db.js';
import type { RevalidationResult } from '../../src/httpClient.js';
import { crawlSections } from '../../src/sections/crawlSections.js';
import type { SectionFetcher } from '../../src/sections/document.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sections');
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name), 'utf8');

/**
 * A stand-in for mafteiach.app with the same cache semantics as
 * PoliteFetcher: `revalidate: false` answers from what was served before
 * without a request; otherwise every call is a request, and `changed` says
 * whether the body differs from the last one served for that URL.
 */
class FakeSite implements SectionFetcher {
  requests: string[] = [];
  private readonly served = new Map<string, string>();

  constructor(private readonly respond: (url: string) => string) {}

  async fetchWithRevalidation(url: string, options: { revalidate?: boolean } = {}): Promise<RevalidationResult> {
    const previous = this.served.get(url);
    if (previous !== undefined && options.revalidate === false) return { body: previous, etag: null, changed: false };
    this.requests.push(url);
    const body = this.respond(url);
    this.served.set(url, body);
    return { body, etag: null, changed: body !== previous };
  }
}

describe('crawlSections over the real page fixtures (a pilot run, limit 1)', () => {
  const routes: Array<[RegExp, string]> = [
    [/\/likkutei_sichos\/by_volume\/\d+\.js$/, 'ls-by-volume-1.raw.js'],
    [/\/likkutei_sichos\/by_parsha\/[^/]+\.js$/, 'ls-by-parsha-bereshit.raw.js'],
    [/\/likkutei_sichos\/by_moad\/[^/]+\.js$/, 'ls-by-moad-rosh_hashanah.raw.js'],
    [/\/maamorim\.js\?order=by_year&year=\d+$/, 'maamorim-by-year-5711.raw.js'],
    [/\/maamorim\.js\?melukat=true&order=by_volume&volume=\d+$/, 'maamorim-melukat-1.raw.js'],
    [/\/maamorim\/1\/fragment\.js$/, 'maamor-1-fragment.raw.js'],
    [/\/yomanim\/by_year\/\d+\.js$/, 'yomanim-by-year-5711.raw.js'],
    [/\/hadranim\/by_masechta\/[^/]+\.js$/, 'hadranim-by-masechta-berachos.raw.js'],
    [/\/hadranim\/by_year\/\d+\.js$/, 'hadranim-by-year-5736.raw.js'],
    [/\/michtavim_klolim_new\/by_moed\/[^/]+\.js$/, 'michtavim-by-moed-shevat.raw.js'],
    [/\/michtavim_klolim_new\/by_year\/\d+\.js$/, 'michtavim-by-year-5740.raw.js'],
    [/\/all\/moadim\/rosh_hashanah\.js$/, 'all-moadim-rosh_hashanah-nav.raw.js'],
    [/\/all\/moadim\/[^/]+\.js\?include_right_nav=false$/, 'all-moadim-rosh_hashanah.raw.js'],
    [/\/all\/parshiyos\/[^/]+\.js(\?include_right_nav=false)?$/, 'all-parshiyos-bereshit-nav.raw.js'],
  ];
  const site = new FakeSite((url) => {
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new Error(`unexpected request: ${url}`);
    return fixture(route[1]);
  });

  it('reads every section into its tables', async () => {
    const db = openDatabase(':memory:');
    const results = await crawlSections({ db, fetcher: site, limit: 1, now: 't1' });
    const bySection = Object.fromEntries(results.map((r) => [r.section, r]));
    expect(results.map((r) => r.section)).toEqual(['likkuteiSichos', 'maamorim', 'yomanim', 'hadranim', 'michtavim', 'moadim', 'parshiyos']);

    expect(bySection.likkuteiSichos).toMatchObject({ inserted: 3, missingIds: [] });
    expect(count(db, 'ls_links')).toBe(7);
    expect(count(db, "nav_entries WHERE section = 'likkuteiSichos'")).toBe(39 + 54 + 57);
    expect(ids(db, "SELECT item_id AS id FROM memberships WHERE section = 'likkuteiSichos' AND kind = 'parsha' ORDER BY ord")).toEqual(['1:1', '2:443', '2:657']);

    expect(bySection.maamorim).toMatchObject({ inserted: 1 });
    expect(db.prepare('SELECT hebrew_year, month_token, dibur_hamaschil, hebrew_date, has_mugah, has_bilti_mugah, has_audio, has_hagahos FROM maamorim WHERE id = 1').get()).toEqual({
      hebrew_year: 5711,
      month_token: '05',
      dibur_hamaschil: 'באתי לגני',
      hebrew_date: '5711-05-10',
      has_mugah: 1,
      has_bilti_mugah: 1,
      has_audio: 1,
      has_hagahos: 1,
    });
    expect(count(db, 'maamorim_links WHERE maamor_id = 1')).toBe(5);
    expect(ids(db, "SELECT item_id AS id FROM memberships WHERE section = 'maamorim' AND kind = 'melukat' AND slug = '1' ORDER BY ord")).toEqual(['1', '2', '24']);
    expect(bySection.maamorim!.warnings).toContain('maamorim: 1 maamar(im) no farbrengen links to');

    expect(bySection.yomanim).toMatchObject({ inserted: 6 });
    expect(bySection.hadranim).toMatchObject({ inserted: 6 });
    expect(count(db, 'hadran_occasions WHERE hadran_id = 102')).toBe(3);
    expect(count(db, "memberships WHERE section = 'hadranim' AND kind = 'masechta' AND slug = 'berachos'")).toBe(3);
    expect(bySection.michtavim).toMatchObject({ inserted: 5 });
    expect(count(db, 'michtavim_citations')).toBeGreaterThan(0);

    expect(bySection.moadim).toMatchObject({ inserted: 1 });
    expect(db.prepare("SELECT name FROM moadim WHERE slug = '22_shevat%20'").get()).toEqual({ name: 'כ"ב שבט' });
    expect(ids(db, "SELECT CAST(occasion_id AS TEXT) AS id FROM occasion_moadim WHERE moad_slug = 'rosh_hashanah' ORDER BY ord")).toEqual(['11112814', '11112880']);
    expect(bySection.moadim!.warnings.some((w) => w.includes('not in occasions yet'))).toBe(true);
    expect(bySection.parshiyos).toMatchObject({ inserted: 1 });
    expect(count(db, 'parshiyos')).toBe(53);
  });
});

describe('crawlSections change tracking (a synthetic Likkutei Sichos and /all/moadim)', () => {
  function lsVolume(sichos: Array<{ page: number; label: string }>, volume = 1): string {
    const items = sichos
      .map(
        (s) =>
          `<button id="likkut_sicha_${volume}_${s.page}__button" class="likkut-sicha-button">${s.label}</button>` +
          `<div id="likkut_sicha_${volume}_${s.page}__content" class="sicha-content"><div class="button-row"><a href="https://drive.google.com/open?id=f${volume}-${s.page}">שיחה</a></div></div>`,
      )
      .join('');
    return (
      `<main><div id="volumes" class="side-nav"><button id="volume_1" onclick="window.location.href='/likkutei_sichos/by_volume/1'">א</button></div>` +
      `<div id="parsha_1" class="parsha"><button id="parsha_1_button" class="parsha-button">בראשית <span>(${sichos.length})</span></button><div id="parsha_1_content">${items}</div></div></main>`
    );
  }
  function lsGrouped(kind: 'parsha' | 'moad', slug: string, sichaIds: string[]): string {
    const buttons = sichaIds.map((id) => `<button id="likkut_sicha_${id.replace(':', '_')}__button" class="likkut-sicha-button">x</button>`).join('');
    return `<main><div class="side-nav"><button id="${kind}_${slug}" onclick="window.location.href='/likkutei_sichos/by_${kind}/${slug}'">${slug}</button></div>${buttons}</main>`;
  }
  function jsonLiteral(html: string): string {
    return `let html = ${JSON.stringify(html)}\n    window.setOuterHTMLWithScripts(document.getElementsByTagName('main')[0], html)`;
  }
  function moadimPage(tabs: string[], occasionIds: number[]): string {
    const nav = tabs.map((slug, i) => `<a id="right_nav_tab_${i + 1}" href="/all/moadim/${slug}">${slug}</a>`).join('');
    const items = occasionIds
      .map((id) => `<div class="farbrengen"><button class="farbrengen-button" onclick="loadFarbrengenFragment(event, ${id}, false, '5711-01-01')"><div>x</div></button></div>`)
      .join('');
    return jsonLiteral(`<div>${nav}</div>${items}`);
  }

  let volumeSichos = [
    { page: 1, label: 'ח"א ע\' 1 (בראשית)' },
    { page: 4, label: 'ח"א ע\' 4 (נח)' },
  ];
  const site = new FakeSite((url) => {
    if (url.endsWith('/likkutei_sichos/by_volume/1.js')) return lsVolume(volumeSichos);
    // A volume the menu omits but a moad page points into (like volume 40 on the site).
    if (url.endsWith('/likkutei_sichos/by_volume/2.js')) return lsVolume([{ page: 7, label: 'ח"ב ע\' 7' }], 2);
    if (url.endsWith('/likkutei_sichos/by_parsha/bereshit.js')) return lsGrouped('parsha', 'bereshit', ['1:1', '1:4', '1:99']);
    if (url.endsWith('/likkutei_sichos/by_moad/rosh_hashanah.js')) return lsGrouped('moad', 'rosh_hashanah', ['1:4', '2:7']);
    if (url.endsWith('/all/moadim/rosh_hashanah.js')) return moadimPage(['rosh_hashanah', 'purim'], []);
    if (url.endsWith('/all/moadim/rosh_hashanah.js?include_right_nav=false')) return moadimPage([], [10, 11]);
    if (url.endsWith('/all/moadim/purim.js?include_right_nav=false')) return moadimPage([], [12]);
    throw new Error(`unexpected request: ${url}`);
  });
  const db = openDatabase(':memory:');
  const insertOccasion = db.prepare(
    `INSERT INTO occasions (id, hebrew_year, hebrew_date, is_pre_nesius, occasion_label, has_mugah, has_bilti_mugah, has_maamorim, has_audio, has_video, has_english, has_tochen_inyanim, has_hagahos, has_hosofos, content_hash, first_seen_at, last_crawled_at, last_changed_at)
     VALUES (?, 5711, '5711-01-01', 0, 'x', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'h', 't', 't', 't')`,
  );
  insertOccasion.run(10);
  insertOccasion.run(11);

  it('inserts on the first run, reads a volume only the grouped views point into as a supplement, and warns about a sicha no volume page has', async () => {
    const [ls] = await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], now: 't1' });
    expect(ls).toMatchObject({ inserted: 3, updated: 0, unchanged: 0, newIds: ['1:1', '1:4', '2:7'], missingIds: [] });
    expect(ls!.warnings).toEqual(['likkuteiSichos: by_parsha/bereshit lists 1 sicha(s) no volume page has: 1:99']);
    const nav = (kind: string) =>
      db.prepare("SELECT slug, name, ord FROM nav_entries WHERE section = 'likkuteiSichos' AND kind = ? ORDER BY ord").all(kind).map((r) => ({ ...r }));
    expect(nav('volume')).toEqual([{ slug: '1', name: 'א', ord: 1 }]);
    expect(nav('supplement')).toEqual([{ slug: '2', name: 'ב', ord: 1 }]);
    expect(site.requests.filter((u) => u.includes('/by_volume/'))).toEqual([
      'https://www.mafteiach.app/likkutei_sichos/by_volume/1.js',
      'https://www.mafteiach.app/likkutei_sichos/by_volume/2.js',
    ]);
  });

  it('writes nothing new on an unchanged second run', async () => {
    const [ls] = await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], now: 't2' });
    expect(ls).toMatchObject({ inserted: 0, updated: 0, unchanged: 3, changedPages: 0 });
    expect(db.prepare("SELECT last_changed_at, last_crawled_at FROM ls_sichos WHERE id = '1:4'").get()).toEqual({ last_changed_at: 't1', last_crawled_at: 't2' });
  });

  it('updates exactly the edited sicha', async () => {
    volumeSichos = [volumeSichos[0]!, { page: 4, label: 'ח"א ע\' 4 (נח) - מתוקן' }];
    const [ls] = await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], now: 't3' });
    expect(ls).toMatchObject({ inserted: 0, updated: 1, unchanged: 2 });
    expect(db.prepare("SELECT label, last_changed_at FROM ls_sichos WHERE id = '1:4'").get()).toEqual({ label: 'ח"א ע\' 4 (נח) - מתוקן', last_changed_at: 't3' });
  });

  it('reports a sicha the site stopped listing without deleting it', async () => {
    volumeSichos = [volumeSichos[1]!];
    const [ls] = await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], now: 't4' });
    expect(ls!.missingIds).toEqual(['1:1']);
    expect(db.prepare("SELECT count(*) AS n FROM ls_sichos WHERE id = '1:1'").get()).toEqual({ n: 1 });
  });

  it('does not report missing ids on a limited run, and re-parses from the cache without a request when revalidate is false', async () => {
    const [limited] = await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], limit: 1, now: 't5' });
    expect(limited!.missingIds).toEqual([]);
    const before = site.requests.length;
    await crawlSections({ db, fetcher: site, sections: ['likkuteiSichos'], revalidate: false, now: 't6' });
    expect(site.requests.length).toBe(before);
  });

  it("stores mafteiach's moadim and which farbrengens each groups, warning about occasions not yet synced", async () => {
    const [moadim] = await crawlSections({ db, fetcher: site, sections: ['moadim'], now: 't7' });
    expect(moadim).toMatchObject({ checked: 2, inserted: 2 });
    expect(db.prepare('SELECT slug, name, ord FROM moadim ORDER BY ord').all().map((r) => ({ ...r }))).toEqual([
      { slug: 'rosh_hashanah', name: 'rosh_hashanah', ord: 1 },
      { slug: 'purim', name: 'purim', ord: 2 },
    ]);
    expect(db.prepare('SELECT occasion_id, moad_slug FROM occasion_moadim ORDER BY moad_slug, ord').all().map((r) => ({ ...r }))).toEqual([
      { occasion_id: 12, moad_slug: 'purim' },
      { occasion_id: 10, moad_slug: 'rosh_hashanah' },
      { occasion_id: 11, moad_slug: 'rosh_hashanah' },
    ]);
    expect(moadim!.warnings).toEqual(['moadim: 1 listed farbrengen(s) are not in occasions yet - run the farbrengen sync first']);
    const [again] = await crawlSections({ db, fetcher: site, sections: ['moadim'], now: 't8' });
    expect(again).toMatchObject({ inserted: 0, unchanged: 2 });
  });
});

function count(db: DatabaseSync, from: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${from}`).get() as { n: number }).n;
}

function ids(db: DatabaseSync, sql: string): string[] {
  return (db.prepare(sql).all() as Array<{ id: string }>).map((row) => row.id);
}
