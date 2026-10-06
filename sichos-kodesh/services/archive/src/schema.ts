/**
 * The archive's store is a small Git-like model, not a flat crawl log:
 * every change to what the archive holds or says about an item is a
 * commit, so a catalog release is a tagged commit and any version can be
 * rebuilt. Today only the crawler writes commits (as the bot author
 * "crawl"); the Drive's contributions will write `pending` commits that
 * an editor moves to `main`.
 *
 *   commits    who changed what, when, and whether it is on main
 *   objects    every stored file, by hash, with its kind and profile
 *   sources    where each object's bytes came from (url, etag, when),
 *              and the unresolved fetches (status != 'ok')
 *   wanted     the inventory: which objects each item should have, from
 *              the indexers - the crawler's to-do list
 *   refs       item -> object, as actually stored (a wanted row that
 *              was fetched), with the commit that added it
 *   derivations an original recording -> its encoding in a smaller audio
 *              profile (sk-pack transcode), stored under derived/<profile>/;
 *              derived bytes can always be made again from the original
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS commits (
  id TEXT PRIMARY KEY,
  parent TEXT,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('main', 'pending', 'rejected'))
);

CREATE TABLE IF NOT EXISTS objects (
  sha256 TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'pdf', 'text')),
  profile TEXT,
  mime TEXT,
  commit_id TEXT NOT NULL REFERENCES commits(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  source TEXT NOT NULL CHECK (source IN ('jem', 'drive', 'contribution')),
  url TEXT NOT NULL,
  sha256 TEXT REFERENCES objects(sha256),
  status TEXT NOT NULL CHECK (status IN ('ok', 'unresolved', 'error')),
  http_status INTEGER,
  etag TEXT,
  last_modified TEXT,
  content_type TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT,
  PRIMARY KEY (source, url)
);
CREATE INDEX IF NOT EXISTS sources_sha256 ON sources(sha256);
CREATE INDEX IF NOT EXISTS sources_status ON sources(status);

CREATE TABLE IF NOT EXISTS wanted (
  collection TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('audio', 'pdf', 'text')),
  source_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  resource_key TEXT,
  label TEXT,
  ord INTEGER,
  duration_ms INTEGER,
  hebrew_year INTEGER,
  hebrew_date TEXT,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (collection, item_id, kind, source_id, role)
);
CREATE INDEX IF NOT EXISTS wanted_url ON wanted(source, url);

CREATE TABLE IF NOT EXISTS refs (
  collection TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sha256 TEXT NOT NULL REFERENCES objects(sha256),
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  label TEXT,
  ord INTEGER,
  duration_ms INTEGER,
  commit_id TEXT NOT NULL REFERENCES commits(id),
  removed_commit TEXT REFERENCES commits(id),
  PRIMARY KEY (collection, item_id, sha256, role)
);
CREATE INDEX IF NOT EXISTS refs_sha256 ON refs(sha256);

CREATE TABLE IF NOT EXISTS derivations (
  src_sha256 TEXT NOT NULL REFERENCES objects(sha256),
  profile TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  encoder TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (src_sha256, profile)
);
CREATE INDEX IF NOT EXISTS derivations_sha256 ON derivations(sha256);

CREATE TABLE IF NOT EXISTS verifications (
  sha256 TEXT NOT NULL REFERENCES objects(sha256),
  verified_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  PRIMARY KEY (sha256, verified_at)
);
`;
