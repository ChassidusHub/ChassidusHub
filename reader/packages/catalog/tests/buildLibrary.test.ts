import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '@chassidushub-reader/mafteiach-index';
import { describe, expect, it } from 'vitest';
import { buildLibrary, jemHebrewDate } from '../src/library/buildLibrary.js';
import { libraryCounts, libraryItem, occasionMoadim, occasionParshiyos } from '../src/library/lookup.js';
import { parseCatalogLibrary } from '../src/library/parse.js';
import { LIBRARY_COLLECTION_IDS } from '../src/library/types.js';

// A mafteiach.db with the indexer's real schema and one or two items of
// every section, as the section crawlers write them.
function mafteiachDb(): DatabaseSync {
  const db = openDatabase(':memory:');
  const bookkeeping = "'h', 't', 't', 't'";
  db.exec(`
    INSERT INTO occasions (id, hebrew_year, hebrew_date, is_pre_nesius, occasion_label, has_mugah, has_bilti_mugah, has_maamorim, has_audio, has_video, has_english, has_tochen_inyanim, has_hagahos, has_hosofos, content_hash, first_seen_at, last_crawled_at, last_changed_at) VALUES
      (100, 5711, '5711-05-10', 0, 'יו"ד שבט', 0, 1, 1, 1, 0, 0, 0, 0, 0, ${bookkeeping}),
      (900, 5700, '5700-01-01', 1, 'ר"ה', 1, 0, 0, 0, 0, 0, 0, 0, 0, ${bookkeeping});
    INSERT INTO links (occasion_id, section, group_label, label, url) VALUES
      (100, 'maamorim', NULL, 'ראה מאמר', '/maamorim/1'),
      (900, 'mugah', NULL, 'רשימות חוברת א', 'https://drive.google.com/open?id=RESHIMA');
    INSERT INTO jem_audio (occasion_id, ccdb_event_id, chapter_index, chapter_name, duration_ms, url, file_format, resolved_at) VALUES
      (100, 11, 0, 'Sicha 1', 1000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001A.mp3', 'mp3', 't');

    INSERT INTO nav_entries (section, kind, slug, name, ord) VALUES
      ('moadim', 'moad', 'rosh_hashanah', 'ראש השנה', 1), ('moadim', 'moad', '10_shvat', 'יו"ד שבט', 2),
      ('parshiyos', 'parsha', 'bo', 'בא', 1),
      ('likkuteiSichos', 'volume', '1', 'א', 1), ('likkuteiSichos', 'supplement', '40', 'מ', 1), ('likkuteiSichos', 'parsha', 'noach', 'נח', 1),
      ('maamorim', 'year', '5711', 'תשי"א', 1), ('maamorim', 'melukat', '1', 'א', 1), ('maamorim', 'melukat', '2', 'ב', 2),
      ('yomanim', 'year', '5711', 'תשי"א', 1),
      ('hadranim', 'masechta', 'berachos', 'ברכות', 1), ('hadranim', 'masechta', 'shabbos', 'שבת', 2), ('hadranim', 'year', '5725', 'תשכ"ה', 1),
      ('michtavim', 'moed', 'shevat', 'שבט', 1), ('michtavim', 'year', '5711', 'תשי"א', 1);
    INSERT INTO memberships (section, kind, slug, item_id, ord) VALUES
      ('moadim', 'moad', '10_shvat', '100', 1),
      ('parshiyos', 'parsha', 'bo', '100', 1),
      ('likkuteiSichos', 'parsha', 'noach', '1:4', 1), ('likkuteiSichos', 'parsha', 'noach', '40:9', 2),
      ('maamorim', 'melukat', '1', '1', 1), ('maamorim', 'melukat', '2', '1', 3),
      ('hadranim', 'year', '5725', '101', 1),
      ('hadranim', 'masechta', 'berachos', '101', 1), ('hadranim', 'masechta', 'shabbos', '101', 1),
      ('michtavim', 'year', '5711', '195', 1);

    INSERT INTO ls_sichos (id, volume, page, label, section_seq, section_label, ord, kitzur_id, has_sicha, has_translated, has_kitzur, content_hash, first_seen_at, last_crawled_at, last_changed_at) VALUES
      ('1:4', 1, 4, 'ח"א ע'' 4 (נח)', 2, 'נח', 2, 2, 1, 1, 1, ${bookkeeping}),
      ('1:1', 1, 1, 'ח"א ע'' 1 (בראשית)', 1, 'בראשית', 1, NULL, 1, 0, 0, ${bookkeeping}),
      ('40:9', 40, 9, 'ח"מ [א] ע'' 9 (נח)', 1, 'נח', 1, NULL, 1, 0, 0, ${bookkeeping});
    INSERT INTO ls_links (sicha_id, role, label, url) VALUES
      ('1:4', 'sicha', 'שיחה', 'https://drive.google.com/open?id=LS4'),
      ('1:4', 'translated', 'מתורגם', 'https://drive.google.com/file/d/LS4T/view'),
      ('1:4', 'kitzur', 'קיצור', '/likkutei_sichos/2/kitzur'),
      ('1:1', 'sicha', 'שיחה', 'https://drive.google.com/open?id=LS1'),
      ('40:9', 'sicha', 'שיחה', 'https://drive.google.com/open?id=LS40');

    INSERT INTO maamorim (id, hebrew_year, month_token, occasion_label, dibur_hamaschil, hemshech, kuntres, hebrew_date, occasion_id, has_mugah, has_bilti_mugah, has_audio, has_video, has_tochen_inyanim, has_hagahos, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (1, 5711, '05', 'יו"ד שבט', 'באתי לגני', 'א', 'מאמר יו"ד שבט', '5711-05-10', 100, 1, 1, 1, 0, 1, 0, ${bookkeeping});
    INSERT INTO maamorim_links (maamor_id, section, group_label, label, url) VALUES
      (1, 'mugah', 'מוגה', 'סה"מ מלוקט ח"א', 'https://drive.google.com/open?id=M1'),
      (1, 'biltiMugah', 'בלתי מוגה', 'הנחה', 'https://docs.google.com/document/d/0B_DOC/edit'),
      (1, 'audio', NULL, 'אודיו', 'https://ashreinu.app/#/player/parentEvent~1_event~4');
    INSERT INTO maamor_jem_audio (maamor_id, ccdb_event_id, chapter_index, chapter_name, duration_ms, url, file_format, resolved_at)
      VALUES (1, 4, 0, 'Ma''amar', 900000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0004A.mp3', 'mp3', 't');

    INSERT INTO yomanim (url, hebrew_year, month_token, ord, label, content_hash, first_seen_at, last_crawled_at, last_changed_at) VALUES
      ('https://drive.google.com/open?id=Y1', 5711, '01', 1, 'ימי בראשית', ${bookkeeping});

    INSERT INTO hadranim (id, masechta_slug, ord, label, date_lines, has_bilti_mugah, has_mugah, has_toichen, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (101, 'berachos', 1, 'ברכות', 'כ'' מנ"א, תשכ"ה', 1, 0, 1, ${bookkeeping});
    INSERT INTO hadranim_links (hadran_id, section, label, url) VALUES (101, 'biltiMugah', 'שיחו"ק', 'https://drive.google.com/open?id=H1');
    INSERT INTO hadran_occasions (hadran_id, hebrew_date, ord) VALUES (101, '5725-11-20', 1);

    INSERT INTO michtavim (id, moed_slug, hebrew_year, ord, heading, has_yiddish, has_hebrew, has_english, has_tochen_inyanim, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (195, 'shevat', 5711, 1, 'ר"ח שבט, ה''תשי"א', 0, 1, 1, 1, ${bookkeeping});
    INSERT INTO michtavim_links (michtav_id, language, edition, label, url) VALUES
      (195, 'he', 'mugah', 'לה"ק - מוגה', 'https://drive.google.com/file/d/MH/view'),
      (195, 'en', 'mugah', 'English - מוגה', 'https://drive.google.com/file/d/ME/view');
    INSERT INTO michtavim_citations (michtav_id, prefix, label, url) VALUES (195, 'לה"ק - מוגה', 'לקו"ש חי"א ע'' 216', 'https://drive.google.com/file/d/MH/view');
  `);
  return db;
}

function jemDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE events (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT NOT NULL, type TEXT NOT NULL, has_long_description INTEGER NOT NULL, has_transcript INTEGER NOT NULL, has_own_audio INTEGER NOT NULL,
      hebrew_year INTEGER, hebrew_month INTEGER, hebrew_day INTEGER);
    CREATE TABLE audio_recordings (event_id INTEGER, ccdb_recording_id INTEGER, name TEXT, duration_ms INTEGER, url TEXT, file_format TEXT);
    INSERT INTO events VALUES (10, NULL, 'Farbrengen, Yud Shevat, 5711', 'Farbrengen', 0, 0, 0, 5711, 5, 10);
    INSERT INTO events VALUES (11, 10, 'Sicha 1', 'Farbrengen – Sicha', 0, 0, 1, 5711, 5, 10);
    INSERT INTO events VALUES (12, 10, 'Sicha 2', 'Farbrengen – Sicha', 0, 0, 1, 5711, 5, 10);
    INSERT INTO events VALUES (20, NULL, 'Children''s Rally, 5748', 'Children’s Rally ', 0, 1, 1, 5748, 7, 14);
    INSERT INTO events VALUES (30, NULL, 'No audio', 'Sicha', 0, 0, 0, 5748, 1, 1);
    INSERT INTO audio_recordings VALUES (12, 102, 'Sicha 2', 2000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001B.mp3', 'mp3');
    INSERT INTO audio_recordings VALUES (11, 101, 'Sicha 1', 1000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0001A.mp3', 'mp3');
    INSERT INTO audio_recordings VALUES (20, 201, NULL, 3000, 'https://dtgj2yu3gmlic.cloudfront.net/AR0020397.mp3', 'mp3');
  `);
  return db;
}

describe('buildLibrary', () => {
  const library = buildLibrary(mafteiachDb(), jemDb());

  it("takes mafteiach's moadim and parshiyos, with the farbrengens each groups", () => {
    expect(library.moadim).toEqual([
      { slug: 'rosh_hashanah', name: 'ראש השנה', nameEn: 'Rosh Hashanah', occasionIds: [] },
      { slug: '10_shvat', name: 'יו"ד שבט', nameEn: '10 Shevat', occasionIds: [100] },
    ]);
    expect(occasionMoadim(library, 100).map((m) => m.slug)).toEqual(['10_shvat']);
    expect(occasionParshiyos(library, 100).map((p) => p.name)).toEqual(['בא']);
  });

  it('builds Likkutei Sichos: printed label, Drive refs for the sicha and its translation, the kitzur only as an id', () => {
    const { items, groups } = library.collections.likkuteiSichos;
    expect(items.map((i) => i.id)).toEqual(['1:1', '1:4', '40:9']);
    expect(libraryItem(library, 'likkuteiSichos', '1:4')).toEqual({
      id: '1:4',
      label: 'ח"א ע\' 4 (נח)',
      volume: 1,
      page: 4,
      sectionLabel: 'נח',
      hasTranslated: true,
      hasKitzur: true,
      kitzurId: 2,
      refs: [
        { kind: 'pdf', sourceId: 'LS4', role: 'sicha', label: 'שיחה' },
        { kind: 'pdf', sourceId: 'LS4T', role: 'translated', label: 'מתורגם' },
      ],
    });
    expect(groups.volume).toEqual([{ slug: '1', name: 'א', itemIds: ['1:1', '1:4'] }]);
    expect(groups.parsha).toEqual([{ slug: 'noach', name: 'נח', itemIds: ['1:4', '40:9'] }]);
  });

  it('keeps "חלק מ" out of the volumes: its sichos are flagged and grouped as a supplement', () => {
    const { groups } = library.collections.likkuteiSichos;
    expect(libraryItem(library, 'likkuteiSichos', '40:9')).toMatchObject({ volume: 40, supplement: true });
    expect(libraryItem(library, 'likkuteiSichos', '1:4')).not.toHaveProperty('supplement');
    expect(groups.supplement).toEqual([{ slug: '40', name: 'מילואים - "חלק מ"', itemIds: ['40:9'] }]);
  });

  it('builds maamorim: citations, Melukat volumes, the farbrengen, PDFs and the resolved audio', () => {
    const maamar = libraryItem(library, 'maamorim', '1')!;
    expect(maamar).toMatchObject({
      label: 'באתי לגני',
      diburHamaschil: 'באתי לגני',
      occasionLabel: 'יו"ד שבט',
      hemshech: 'א',
      occasionId: 100,
      hebrewDate: '5711-05-10',
      melukatVolumes: [1, 2],
      citations: ['סה"מ מלוקט ח"א'],
    });
    // The old Google Doc edition is not a Drive file; the ashreinu player link is not a file at all.
    expect(maamar.refs).toEqual([
      { kind: 'pdf', sourceId: 'M1', role: 'mugah', label: 'סה"מ מלוקט ח"א' },
      { kind: 'audio', sourceId: 'JEMSK0004A.mp3', role: '0', label: "Ma'amar", durationMs: 900000 },
    ]);
    expect(library.collections.maamorim.groups.year).toEqual([{ slug: '5711', name: 'תשי"א', itemIds: ['1'] }]);
  });

  it('builds yomanim, hadranim, michtavim and reshimos', () => {
    expect(library.collections.yomanim.items).toEqual([{ id: 'Y1', label: 'ימי בראשית', hebrewYear: 5711, monthToken: '01', refs: [{ kind: 'pdf', sourceId: 'Y1', role: 'yoman' }] }]);
    expect(libraryItem(library, 'hadranim', '101')).toMatchObject({ masechta: 'berachos', hebrewDates: ['5725-11-20'], hebrewYear: 5725, dateLines: ['כ\' מנ"א, תשכ"ה'] });
    // One siyum on two masechtos: listed under both.
    expect(library.collections.hadranim.groups.masechta).toEqual([
      { slug: 'berachos', name: 'ברכות', itemIds: ['101'] },
      { slug: 'shabbos', name: 'שבת', itemIds: ['101'] },
    ]);
    expect(libraryItem(library, 'michtavimKlolim', '195')).toMatchObject({ moed: 'shevat', languages: ['he', 'en'], citations: [{ prefix: 'לה"ק - מוגה', label: 'לקו"ש חי"א ע\' 216' }] });
    expect(library.collections.reshimos.items).toEqual([
      { id: '900', label: 'ר"ה', hebrewYear: 5700, hebrewDate: '5700-01-01', occasionId: 900, refs: [{ kind: 'pdf', sourceId: 'RESHIMA', role: 'reshimos', label: 'רשימות חוברת א' }] },
    ]);
  });

  it('builds JEM events from the top-level events with audio: chapters in order, the occasion mafteiach links, the type trimmed with a straight apostrophe', () => {
    const { items, groups } = library.collections.jemEvents;
    expect(items.map((i) => i.id)).toEqual(['10', '20']);
    expect(items[0]).toMatchObject({ type: 'Farbrengen', hebrewDate: '5711-05-10', occasionId: 100 });
    expect(items[0]!.refs.map((r) => [r.sourceId, r.role])).toEqual([
      ['JEMSK0001A.mp3', '0'],
      ['JEMSK0001B.mp3', '1'],
    ]);
    expect(items[1]).toMatchObject({ hebrewDate: '5748-06-14', hasTranscript: true });
    expect(items[1]!.type).toBe("Children's Rally");
    expect(groups.year!.map((g) => [g.slug, g.name])).toEqual([
      ['5711', 'תשי״א'],
      ['5748', 'תשמ״ח'],
    ]);
  });

  it('validates, and counts per collection', () => {
    expect(parseCatalogLibrary(JSON.parse(JSON.stringify(library)))).not.toBeNull();
    expect(libraryCounts(library)).toEqual({ likkuteiSichos: 3, maamorim: 1, yomanim: 1, hadranim: 1, michtavimKlolim: 1, reshimos: 1, jemEvents: 2 });
  });

  it('gives empty collections for a database the section crawler never touched', () => {
    const bare = new DatabaseSync(':memory:');
    bare.exec('CREATE TABLE occasions (id INTEGER PRIMARY KEY, hebrew_year INTEGER, hebrew_date TEXT, occasion_label TEXT); CREATE TABLE links (occasion_id INTEGER, section TEXT, label TEXT, url TEXT);');
    const empty = buildLibrary(bare, null);
    expect(empty.moadim).toEqual([]);
    for (const id of LIBRARY_COLLECTION_IDS) expect(empty.collections[id].items).toEqual([]);
  });
});

describe('jemHebrewDate', () => {
  it("maps JEM's 13 month slots onto mafteiach's tokens, Adar by the year", () => {
    expect(jemHebrewDate(5748, 1, 3)).toBe('5748-01-03');
    expect(jemHebrewDate(5748, 7, 14)).toBe('5748-06-14'); // 5748 is not a leap year: plain Adar
    expect(jemHebrewDate(5746, 6, 14)).toBe('5746-06A-14'); // leap year
    expect(jemHebrewDate(5746, 7, 14)).toBe('5746-06B-14');
    expect(jemHebrewDate(5748, 8, 11)).toBe('5748-07-11'); // Nisan
    expect(jemHebrewDate(5748, 13, 18)).toBe('5748-12-18'); // Elul
    expect(jemHebrewDate(5748, null, 1)).toBeUndefined();
  });
});
