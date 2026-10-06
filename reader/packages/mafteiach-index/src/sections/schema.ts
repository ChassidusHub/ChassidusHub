/**
 * Tables for every mafteiach section beyond the dated farbrengens
 * (`occasions` / `links` in db.ts, untouched). Same conventions as
 * `occasions`: one row per item with availability flags, links in a child
 * table, and `content_hash` / `first_seen_at` / `last_crawled_at` /
 * `last_changed_at` so a re-crawl only rewrites what actually changed.
 *
 * No `*_text` column anywhere, on purpose: mafteiach's own editorial
 * writing (Likkutei Sichos teasers, kitzur summaries, tochen inyanim, the
 * hadranim "toichen" box, the AI-written michtavim summaries) is never
 * extracted - only whether it exists. Bibliographic facts (labels, dates,
 * printed citations, dibur hamaschil) and links are what this index holds.
 *
 * Two generic tables carry every side-nav and every "this page lists these
 * items" relation, instead of one table pair per section:
 *
 *   nav_entries   (section, kind, slug) -> Hebrew name + order: LS volumes,
 *                 parshiyos and moadim; masechtos; michtavim moadim; the
 *                 101 moadim and 53 parshiyos of /all; year and volume tabs
 *   memberships   (section, kind, slug, item_id, ord): LS sicha in parsha X,
 *                 maamar in Melukat volume N, hadran in year Y, michtav in
 *                 year Y, farbrengen occasion under moed X or parsha Y
 *
 * The views below give the /all ones the names the catalog reads.
 * `openDatabase` never enables foreign keys, so nothing here relies on them.
 */
export const SECTIONS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS section_pages (
  url TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  etag TEXT,
  body_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nav_entries (
  section TEXT NOT NULL,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (section, kind, slug)
);

CREATE TABLE IF NOT EXISTS memberships (
  section TEXT NOT NULL,
  kind TEXT NOT NULL,
  slug TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (section, kind, slug, item_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_item ON memberships(section, item_id);

-- Likkutei Sichos: one row per sicha, keyed by the volume and start page
-- the site's own element id carries (button#likkut_sicha_{vol}_{page}).
CREATE TABLE IF NOT EXISTS ls_sichos (
  id TEXT PRIMARY KEY,
  volume INTEGER NOT NULL,
  page INTEGER NOT NULL,
  label TEXT NOT NULL,
  section_seq INTEGER NOT NULL,
  section_label TEXT NOT NULL,
  ord INTEGER NOT NULL,
  kitzur_id INTEGER,
  has_sicha INTEGER NOT NULL,
  has_translated INTEGER NOT NULL,
  has_kitzur INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ls_sichos_volume ON ls_sichos(volume);

CREATE TABLE IF NOT EXISTS ls_links (
  sicha_id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ls_links_sicha ON ls_links(sicha_id);

-- Maamorim: the site's own sequential maamar ids.
CREATE TABLE IF NOT EXISTS maamorim (
  id INTEGER PRIMARY KEY,
  hebrew_year INTEGER,
  month_token TEXT,
  occasion_label TEXT NOT NULL,
  dibur_hamaschil TEXT NOT NULL,
  hemshech TEXT,
  kuntres TEXT,
  hebrew_date TEXT,
  occasion_id INTEGER,
  has_mugah INTEGER NOT NULL,
  has_bilti_mugah INTEGER NOT NULL,
  has_audio INTEGER NOT NULL,
  has_video INTEGER NOT NULL,
  has_tochen_inyanim INTEGER NOT NULL,
  has_hagahos INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maamorim_year ON maamorim(hebrew_year);
CREATE INDEX IF NOT EXISTS idx_maamorim_occasion ON maamorim(occasion_id);

CREATE TABLE IF NOT EXISTS maamorim_links (
  maamor_id INTEGER NOT NULL,
  section TEXT NOT NULL,
  group_label TEXT,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maamorim_links_maamor ON maamorim_links(maamor_id);

-- Resolved like jem_audio (bin/resolveMaamarAudio.ts), from the maamar's own ccdb event.
CREATE TABLE IF NOT EXISTS maamor_jem_audio (
  maamor_id INTEGER NOT NULL,
  ccdb_event_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  chapter_name TEXT,
  duration_ms INTEGER NOT NULL,
  url TEXT NOT NULL,
  file_format TEXT NOT NULL,
  resolved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maamor_jem_audio_maamor ON maamor_jem_audio(maamor_id);

-- Yomanim: plain Drive links under a year and month, no ids of their own - keyed by url.
CREATE TABLE IF NOT EXISTS yomanim (
  url TEXT PRIMARY KEY,
  hebrew_year INTEGER NOT NULL,
  month_token TEXT NOT NULL,
  ord INTEGER NOT NULL,
  label TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_yomanim_year ON yomanim(hebrew_year);

CREATE TABLE IF NOT EXISTS hadranim (
  id INTEGER PRIMARY KEY,
  masechta_slug TEXT,
  ord INTEGER NOT NULL,
  label TEXT NOT NULL,
  date_lines TEXT NOT NULL,
  has_bilti_mugah INTEGER NOT NULL,
  has_mugah INTEGER NOT NULL,
  has_toichen INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hadranim_links (
  hadran_id INTEGER NOT NULL,
  section TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hadranim_links_hadran ON hadranim_links(hadran_id);

-- The farbrengens a hadran was said at ("ראה התוועדות" -> /all/{date}).
CREATE TABLE IF NOT EXISTS hadran_occasions (
  hadran_id INTEGER NOT NULL,
  hebrew_date TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (hadran_id, hebrew_date)
);

CREATE TABLE IF NOT EXISTS michtavim (
  id INTEGER PRIMARY KEY,
  moed_slug TEXT,
  hebrew_year INTEGER,
  ord INTEGER NOT NULL,
  heading TEXT NOT NULL,
  has_yiddish INTEGER NOT NULL,
  has_hebrew INTEGER NOT NULL,
  has_english INTEGER NOT NULL,
  has_tochen_inyanim INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS michtavim_links (
  michtav_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  edition TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_michtavim_links_michtav ON michtavim_links(michtav_id);

-- Where a letter was printed (לקו"ש חי"א ע' 216), with the edition it refers to.
CREATE TABLE IF NOT EXISTS michtavim_citations (
  michtav_id INTEGER NOT NULL,
  prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_michtavim_citations_michtav ON michtavim_citations(michtav_id);

CREATE VIEW IF NOT EXISTS moadim AS
  SELECT slug, name, ord FROM nav_entries WHERE section = 'moadim' AND kind = 'moad';
CREATE VIEW IF NOT EXISTS occasion_moadim AS
  SELECT CAST(item_id AS INTEGER) AS occasion_id, slug AS moad_slug, ord FROM memberships WHERE section = 'moadim' AND kind = 'moad';
CREATE VIEW IF NOT EXISTS parshiyos AS
  SELECT slug, name, ord FROM nav_entries WHERE section = 'parshiyos' AND kind = 'parsha';
CREATE VIEW IF NOT EXISTS occasion_parshiyos AS
  SELECT CAST(item_id AS INTEGER) AS occasion_id, slug AS parsha_slug, ord FROM memberships WHERE section = 'parshiyos' AND kind = 'parsha';
`;
