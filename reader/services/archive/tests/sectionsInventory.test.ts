import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '@chassidushub-reader/mafteiach-index';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadInventory } from '../src/inventory.js';
import { ArchiveStore } from '../src/store.js';

// A mafteiach.db with the real schema (the indexer's own openDatabase),
// holding one item of every section collection.
function sectionsDb(file: string): void {
  const db = openDatabase(file);
  db.exec(`
    INSERT INTO occasions (id, hebrew_year, hebrew_date, is_pre_nesius, occasion_label, has_mugah, has_bilti_mugah, has_maamorim, has_audio, has_video, has_english, has_tochen_inyanim, has_hagahos, has_hosofos, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (900, 5700, '5700-01-01', 1, 'ר"ה', 1, 0, 0, 0, 0, 0, 0, 0, 0, 'h', 't', 't', 't');
    INSERT INTO links (occasion_id, section, group_label, label, url) VALUES (900, 'mugah', NULL, 'רשימות חוברת א', 'https://drive.google.com/open?id=RESHIMA');

    INSERT INTO ls_sichos (id, volume, page, label, section_seq, section_label, ord, kitzur_id, has_sicha, has_translated, has_kitzur, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES ('1:4', 1, 4, 'ח"א ע'' 4 (נח)', 2, 'נח', 2, 2, 1, 1, 1, 'h', 't', 't', 't');
    INSERT INTO ls_links (sicha_id, role, label, url) VALUES
      ('1:4', 'sicha', 'שיחה', 'https://drive.google.com/open?id=LS_SICHA'),
      ('1:4', 'translated', 'מתורגם', 'https://drive.google.com/file/d/LS_TRANSLATED/view'),
      ('1:4', 'kitzur', 'קיצור', '/likkutei_sichos/2/kitzur');

    INSERT INTO maamorim (id, hebrew_year, month_token, occasion_label, dibur_hamaschil, hemshech, kuntres, hebrew_date, occasion_id, has_mugah, has_bilti_mugah, has_audio, has_video, has_tochen_inyanim, has_hagahos, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (1, 5711, '05', 'יו"ד שבט', 'באתי לגני', 'א', NULL, '5711-05-10', NULL, 1, 1, 1, 0, 1, 0, 'h', 't', 't', 't');
    INSERT INTO maamorim_links (maamor_id, section, group_label, label, url) VALUES
      (1, 'mugah', 'מוגה', 'סה"מ מלוקט ח"א', 'https://drive.google.com/open?id=MAAMAR_MUGAH'),
      (1, 'biltiMugah', 'בלתי מוגה - מהדורה ישנה', 'הנחה', 'https://docs.google.com/document/d/0B_DOC/edit'),
      (1, 'audio', NULL, 'אודיו', 'https://ashreinu.app/#/player/parentEvent~1_event~4');
    INSERT INTO maamor_jem_audio (maamor_id, ccdb_event_id, chapter_index, chapter_name, duration_ms, url, file_format, resolved_at)
      VALUES (1, 4, 0, 'Ma''amar', 900000, 'https://dtgj2yu3gmlic.cloudfront.net/JEMSK0004A.mp3', 'mp3', 't');

    INSERT INTO yomanim (url, hebrew_year, month_token, ord, label, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES ('https://drive.google.com/open?id=YOMAN', 5711, '01', 1, 'ימי בראשית', 'h', 't', 't', 't');

    INSERT INTO hadranim (id, masechta_slug, ord, label, date_lines, has_bilti_mugah, has_mugah, has_toichen, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (101, 'berachos', 1, 'ברכות', 'כ'' מנ"א, תשכ"ה', 1, 0, 1, 'h', 't', 't', 't');
    INSERT INTO hadranim_links (hadran_id, section, label, url) VALUES (101, 'biltiMugah', 'שיחו"ק', 'https://drive.google.com/open?id=HADRAN');

    INSERT INTO michtavim (id, moed_slug, hebrew_year, ord, heading, has_yiddish, has_hebrew, has_english, has_tochen_inyanim, content_hash, first_seen_at, last_crawled_at, last_changed_at)
      VALUES (195, 'shevat', 5711, 1, 'ר"ח שבט, ה''תשי"א', 0, 1, 0, 1, 'h', 't', 't', 't');
    INSERT INTO michtavim_links (michtav_id, language, edition, label, url) VALUES (195, 'he', 'mugah', 'לה"ק - מוגה', 'https://drive.google.com/file/d/MICHTAV/view');
  `);
  db.close();
}

describe('inventory of the section collections', () => {
  let dir: string;
  let store: ArchiveStore;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sk-archive-sections-'));
    store = await ArchiveStore.open(path.join(dir, 'root'));
  });
  afterAll(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('wants every Drive file of every collection, and the maamar audio, keyed the way the catalog will key them', () => {
    const mafteiachDb = path.join(dir, 'mafteiach.db');
    sectionsDb(mafteiachDb);
    const result = loadInventory(store, { mafteiachDb });
    expect(result.collections).toEqual({
      likkuteiSichos: { pdfs: 2, audio: 0, nonDrive: 1 },
      maamorim: { pdfs: 1, audio: 1, nonDrive: 1 },
      yomanim: { pdfs: 1, audio: 0, nonDrive: 0 },
      hadranim: { pdfs: 1, audio: 0, nonDrive: 0 },
      michtavimKlolim: { pdfs: 1, audio: 0, nonDrive: 0 },
      reshimos: { pdfs: 1, audio: 0, nonDrive: 0 },
    });
    const rows = store.db
      .prepare("SELECT collection, item_id, kind, source_id, role FROM wanted WHERE collection != 'farbrengens' ORDER BY collection, item_id, role")
      .all()
      .map((r) => ({ ...r }));
    expect(rows).toEqual([
      { collection: 'hadranim', item_id: '101', kind: 'pdf', source_id: 'HADRAN', role: 'biltiMugah' },
      { collection: 'likkuteiSichos', item_id: '1:4', kind: 'pdf', source_id: 'LS_SICHA', role: 'sicha' },
      { collection: 'likkuteiSichos', item_id: '1:4', kind: 'pdf', source_id: 'LS_TRANSLATED', role: 'translated' },
      { collection: 'maamorim', item_id: '1', kind: 'audio', source_id: 'JEMSK0004A.mp3', role: '0' },
      { collection: 'maamorim', item_id: '1', kind: 'pdf', source_id: 'MAAMAR_MUGAH', role: 'mugah' },
      { collection: 'michtavimKlolim', item_id: '195', kind: 'pdf', source_id: 'MICHTAV', role: 'he:mugah' },
      { collection: 'reshimos', item_id: '900', kind: 'pdf', source_id: 'RESHIMA', role: 'reshimos' },
      { collection: 'yomanim', item_id: 'YOMAN', kind: 'pdf', source_id: 'YOMAN', role: '' },
    ]);
  });
});
