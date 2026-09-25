/**
 * The translators, as `@sichos-kodesh/catalog/translate`: for tools that
 * name things themselves (the station's player folders) from data that may
 * predate the catalog's own translations. Kept out of the main entry so the
 * apps, which read the translated fields, never bundle the dictionaries.
 */
export { translateChapterName } from './chapterNameHe.js';
export { translateOccasionLabel } from './occasionLabelEn.js';
export { groupNameEn } from './groupNameEn.js';
export { translateLibrary, type LibraryTranslations } from './library.js';
export { shortenCatalogYear, shortenLibrary, type ShortTitles } from './shortTitles.js';
