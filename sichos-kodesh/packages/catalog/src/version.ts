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
export const CATALOG_VERSION = '1.3.0';

/**
 * The shape of the data itself - bumped only when a change to
 * `CatalogEntry`/`CatalogAudio`/`CatalogPdf` would break an app that
 * still parses the old shape. An app never applies a fetched catalog
 * whose schema version differs from the one it was built with; it keeps
 * its bundled data and waits for its own update instead.
 */
export const CATALOG_SCHEMA_VERSION = 1;

/**
 * Schema 2: the same farbrengens (`byYear`, unchanged) plus the library -
 * Likkutei Sichos, maamorim, yomanim, hadranim, michtavim klolim,
 * reshimos, JEM events, and mafteiach's moadim and parshiyos (see
 * library/types.ts). The phone app runs on it and fetches `/v2/`; the web
 * app stays on schema 1 and `/v1/`, so neither ever receives data it
 * cannot read. A separate constant rather than bumping the one above,
 * which the web app still builds with.
 */
export const CATALOG_LIBRARY_SCHEMA_VERSION = 2;

/**
 * Schema 3: schema 2 unchanged (`byYear`, `library`), plus the works - the
 * Rebbeim, their seforim, and the imported works' contents and units (see
 * works/types.ts). The phone runs on it and fetches `/v3/`. Phones still on
 * schema 2 keep fetching `/v2/`, which stays served.
 */
export const CATALOG_WORKS_SCHEMA_VERSION = 3;
