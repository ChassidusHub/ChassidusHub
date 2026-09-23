/**
 * The version of the catalog *data* the apps bundle - independent of the
 * apps' own versions and of this package's npm version. Bumped by hand
 * alongside an entry in changelog.ts and CHANGELOG.md whenever the shipped
 * data changes (a re-crawl, a corrected date, a new year, a new content
 * kind), and tagged `catalog-v<version>` on the commit that ships it - see
 * README.md's "Catalog releases". The apps compare it with the manifest
 * api.sk.shmuky.dev serves (release.ts) to decide whether a newer catalog
 * is available to fetch.
 */
export const CATALOG_VERSION = '1.0.0';

/**
 * The shape of the data itself - bumped only when a change to
 * `CatalogEntry`/`CatalogAudio`/`CatalogPdf` would break an app that
 * still parses the old shape. An app never applies a fetched catalog
 * whose schema version differs from the one it was built with; it keeps
 * its bundled data and waits for its own update instead.
 */
export const CATALOG_SCHEMA_VERSION = 1;
