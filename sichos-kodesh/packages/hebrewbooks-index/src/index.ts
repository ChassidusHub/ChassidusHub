export { readCatalog, readCatalogDatabase } from './readCatalog.js';
export type { HebrewBooksCatalog } from './readCatalog.js';
export { compareVolumes, hebrewQuotes, seriesKey, splitTitle, volumeNumbers } from './series.js';
export type { SplitTitle } from './series.js';
export { buildShelf, SHELF_AUTHOR_IDS, shelfAuthorOf, shelfSize } from './shelf.js';
export type { HebrewBooksRow, HebrewBooksShelf, ShelfAuthor, ShelfScan, ShelfSeries } from './types.js';
