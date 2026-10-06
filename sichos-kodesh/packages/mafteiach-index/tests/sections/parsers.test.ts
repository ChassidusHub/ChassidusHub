import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAllGroupingNav, parseAllGroupingPage } from '../../src/sections/allGroupings.js';
import { parseHadranimPage, parseHadranimYearNav, parseMasechtaNav } from '../../src/sections/hadranim.js';
import { parseLsGroupedPage, parseLsNav, parseLsVolumePage } from '../../src/sections/likkuteiSichos.js';
import { parseMaamarFragment, parseMaamorimListing, parseMaamorimTabs } from '../../src/sections/maamorim.js';
import { parseMichtavimMoedNav, parseMichtavimPage, parseMichtavimYearNav } from '../../src/sections/michtavim.js';
import { parseYomanimNav, parseYomanimYearPage } from '../../src/sections/yomanim.js';

// Trimmed captures of the live pages (see the comment at the top of each):
// every nav is whole, the lists are cut to a few items, and mafteiach's own
// editorial text is replaced by a placeholder.
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sections');
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name), 'utf8');

describe('Likkutei Sichos', () => {
  const volume = fixture('ls-by-volume-1.raw.js');

  it('reads the 39 volumes from the side-nav', () => {
    const nav = parseLsNav(volume, 'volume');
    expect(nav).toHaveLength(39);
    expect(nav[0]).toEqual({ slug: '1', name: 'א', ord: 1 });
    expect(nav[38]).toEqual({ slug: '39', name: 'לט', ord: 39 });
  });

  it('reads each sicha with its section, id-derived key, links and kitzur id', () => {
    const sichos = parseLsVolumePage(volume);
    expect(sichos.map((s) => s.id)).toEqual(['1:1', '1:4', '1:15']);
    expect(sichos[1]).toMatchObject({ volume: 1, page: 4, label: 'ח"א ע\' 4 (נח)', sectionSeq: 2, sectionLabel: 'נח', ord: 2, kitzurId: 2 });
    expect(sichos[1]!.links.map((l) => l.role)).toEqual(['sicha', 'translated', 'kitzur']);
    expect(sichos[1]!.links[2]!.url).toBe('/likkutei_sichos/2/kitzur');
  });

  it('keeps a sicha that has only the sicha itself (no translation, no kitzur)', () => {
    const third = parseLsVolumePage(volume)[2]!;
    expect(third.links.map((l) => l.role)).toEqual(['sicha']);
    expect(third.kitzurId).toBeNull();
  });

  it('reads the parsha and moed navs (54 and 57), keeping slugs verbatim', () => {
    const parshiyos = parseLsNav(fixture('ls-by-parsha-bereshit.raw.js'), 'parsha');
    expect(parshiyos).toHaveLength(54);
    expect(parshiyos[0]).toEqual({ slug: 'bereshit', name: 'בראשית', ord: 1 });
    const moadim = parseLsNav(fixture('ls-by-moad-rosh_hashanah.raw.js'), 'moad');
    expect(moadim).toHaveLength(57);
    expect(moadim.find((m) => m.slug === '11_nissan%20')?.name).toBe('י"א ניסן');
  });

  it('does not mistake the section headings of a volume page for a parsha nav', () => {
    expect(parseLsNav(volume, 'parsha')).toEqual([]);
  });

  it('reads the sicha ids a by_parsha / by_moad page lists, in order', () => {
    expect(parseLsGroupedPage(fixture('ls-by-parsha-bereshit.raw.js'))).toEqual(['1:1', '2:443', '2:657']);
    expect(parseLsGroupedPage(fixture('ls-by-moad-rosh_hashanah.raw.js'))).toEqual(['2:405', '4:1144', '4:1354']);
  });
});

describe('maamorim', () => {
  const year = fixture('maamorim-by-year-5711.raw.js');

  it('reads the 40 year tabs', () => {
    const tabs = parseMaamorimTabs(year, 'year');
    expect(tabs).toHaveLength(40);
    expect(tabs[0]).toEqual({ slug: '5711', name: 'תשי"א', ord: 1 });
    expect(tabs.map((t) => t.slug)).not.toContain('5750');
  });

  it('reads each maamar with its month token, occasion, dibur hamaschil, hemshech and kuntres', () => {
    const entries = parseMaamorimListing(year, 5711);
    expect(entries[0]).toEqual({
      id: 1,
      hebrewYear: 5711,
      monthToken: '05',
      occasionLabel: 'יו"ד שבט',
      diburHamaschil: 'באתי לגני',
      hemshech: 'א',
      kuntres: 'מאמר יו"ד שבט ה\'תשי"א',
    });
    expect(entries.map((e) => e.monthToken)).toEqual(['05', '05', '05', '06A', '06B', '06B']);
    expect(entries[2]).toMatchObject({ diburHamaschil: 'ואלה המשפטים', hemshech: null, kuntres: null });
  });

  it('reads a Melukat volume page (6 volume tabs, no month groups)', () => {
    const page = fixture('maamorim-melukat-1.raw.js');
    expect(parseMaamorimTabs(page, 'volume').map((t) => t.slug)).toEqual(['1', '2', '3', '4', '5', '6']);
    const entries = parseMaamorimListing(page, null);
    expect(entries.map((e) => e.id)).toEqual([1, 2, 24]);
    expect(entries[2]).toMatchObject({ hebrewYear: null, monthToken: null, occasionLabel: 'יו"ד שבט תשי"ב' });
  });

  it('reads a fragment: printed citation as the מוגה label, the old bilti-mugah edition, hagahos, audio, the farbrengen date', () => {
    const detail = parseMaamarFragment(fixture('maamor-1-fragment.raw.js'), 1);
    expect(detail.links.map((l) => l.section)).toEqual(['mugah', 'biltiMugah', 'hagahos', 'hagahos', 'audio']);
    expect(detail.links[0]).toMatchObject({ group: 'מוגה', label: 'סה"מ מלוקט ח"א/ סה"מ באתי לגני ח"א/ תו"מ סה"מ באתי לגני ח"א' });
    expect(detail.links[1]!.group).toBe('בלתי מוגה - מהדורה ישנה');
    expect(detail.links[4]!.url).toBe('https://ashreinu.app/#/player/parentEvent~1_event~4');
    expect(detail).toMatchObject({ hasVideo: false, hasTochenInyanim: true, hebrewDate: '5711-05-10' });
  });
});

describe('yomanim', () => {
  const page = fixture('yomanim-by-year-5711.raw.js');

  it('reads the 45 years from the side-nav', () => {
    const nav = parseYomanimNav(page);
    expect(nav).toHaveLength(45);
    expect(nav[0]).toEqual({ slug: '5710', name: 'תש"י', ord: 1 });
  });

  it('takes the month from the group id, so a leap year keeps Adar I and II apart', () => {
    const records = parseYomanimYearPage(page, 5711);
    expect(records.map((r) => [r.monthToken, r.ord])).toEqual([
      ['01', 1],
      ['01', 2],
      ['06A', 1],
      ['06A', 2],
      ['06B', 1],
      ['06B', 2],
    ]);
    expect(records[0]).toMatchObject({ hebrewYear: 5711, label: "א' התמימים", url: 'https://drive.google.com/open?id=1RTt5qCCTsBaERNep-o51ScZGytl5iAOF' });
  });
});

describe('hadranim', () => {
  const page = fixture('hadranim-by-masechta-berachos.raw.js');

  it('reads the 48 masechtos', () => {
    const nav = parseMasechtaNav(page);
    expect(nav).toHaveLength(48);
    expect(nav[47]).toEqual({ slug: 'hadran-al-hashas', name: 'הדרן על הש"ס', ord: 48 });
  });

  it('reads each hadran: date lines, the farbrengens it was said at, links by edition, the toichen only as a flag', () => {
    const [first, second, third] = parseHadranimPage(page, 'berachos');
    expect(first).toMatchObject({ id: 101, ord: 1, label: 'ברכות', dateLines: ['כ\' מנ"א, תשכ"ה'], hebrewDates: ['5725-11-20'], hasToichen: true });
    expect(second!.hebrewDates).toEqual(['5734-03-18', '5734-03-20', '5734-03-27']);
    expect(second!.links).toHaveLength(6);
    expect(third).toMatchObject({ id: 2, label: 'ברכות - מוגה' });
    expect(third!.links.map((l) => l.section)).toEqual(['mugah']);
  });

  it('reads a by_year page (ids carry a _y{year} suffix) and its 38 years', () => {
    const page5736 = fixture('hadranim-by-year-5736.raw.js');
    expect(parseHadranimPage(page5736, null).map((h) => h.id)).toEqual([50, 103, 63]);
    expect(parseHadranimYearNav(page5736)).toHaveLength(38);
  });
});

describe('michtavim klolim', () => {
  const page = fixture('michtavim-by-moed-shevat.raw.js');

  it('reads the 10 moadim', () => {
    expect(parseMichtavimMoedNav(page).map((n) => n.slug)).toEqual([
      'elul-tishrei',
      'cheshvan',
      'kislev-chanuka',
      'shevat',
      'adar',
      'nissan',
      'iyar-sefiras-haomer',
      'sivan',
      'tammuz',
      'menachem-av',
    ]);
  });

  it('reads each letter: year from its group, languages that exist, printed citations', () => {
    const letters = parseMichtavimPage(page, 'shevat', null);
    expect(letters.map((l) => [l.id, l.hebrewYear])).toEqual([
      [195, 5711],
      [196, 5711],
      [117, 5741],
    ]);
    expect(letters[0]).toMatchObject({ moedSlug: 'shevat', heading: 'ר"ח שבט, ה\'תשי"א - לאנ"ש (א)', hasTochenInyanim: true });
    expect(letters[0]!.links.map((l) => [l.language, l.edition])).toEqual([['he', 'mugah']]);
    expect(letters[0]!.citations).toEqual([{ prefix: 'לה"ק - מוגה', label: 'לקו"ש חי"א ע\' 216', url: letters[0]!.links[0]!.url }]);
    expect(letters[2]!.links.map((l) => l.language)).toEqual(['he', 'en']);
  });

  it('reads a by_year page and its 42 years', () => {
    const page5740 = fixture('michtavim-by-year-5740.raw.js');
    expect(parseMichtavimPage(page5740, null, 5740).map((l) => [l.id, l.hebrewYear])).toEqual([
      [106, 5740],
      [107, 5740],
    ]);
    expect(parseMichtavimYearNav(page5740)).toHaveLength(42);
  });
});

describe('/all moadim and parshiyos', () => {
  it("reads mafteiach's 101 moadim with their Hebrew names, slugs verbatim", () => {
    const nav = parseAllGroupingNav(fixture('all-moadim-rosh_hashanah-nav.raw.js'), 'moadim');
    expect(nav).toHaveLength(101);
    expect(nav[0]).toEqual({ slug: 'rosh_hashanah', name: 'ראש השנה', ord: 1 });
    expect(nav.filter((n) => /%20|[A-Z]/.test(n.slug)).map((n) => n.slug)).toEqual(['22_shevat%20', '11_nissan%20', '15_Tammuz']);
  });

  it('reads the farbrengen occasions a moed page lists, with or without the side-nav', () => {
    expect(parseAllGroupingPage(fixture('all-moadim-rosh_hashanah.raw.js'))).toEqual(['11112814', '11112880']);
    expect(parseAllGroupingPage(fixture('all-moadim-rosh_hashanah-nav.raw.js'))).toEqual(['11112814', '11112880']);
  });

  it('reads the 53 parshiyos and a parsha page', () => {
    const page = fixture('all-parshiyos-bereshit-nav.raw.js');
    const nav = parseAllGroupingNav(page, 'parshiyos');
    expect(nav).toHaveLength(53);
    expect(nav[52]).toEqual({ slug: 'haazinu', name: 'האזינו', ord: 53 });
    expect(parseAllGroupingPage(page)).toEqual(['11116124', '11116150', '11116190', '11112823']);
  });
});
