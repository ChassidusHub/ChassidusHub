export interface CatalogChangelogEntry {
  /** Same string as CATALOG_VERSION was when this entry shipped (and the `catalog-v…` tag). */
  version: string;
  /** ISO date (YYYY-MM-DD) the release was tagged. */
  date: string;
  en: string[];
  he: string[];
}

/**
 * Most recent first; user-facing, not a commit log - the apps show the
 * current entry under "Catalog" on their About screens, and the release
 * manifest carries the whole list so an app can also show what a fetched
 * update changed. Same shape as the apps' own changelog entries, plus the
 * date. CHANGELOG.md at the package root is the human-readable copy.
 */
export const CATALOG_CHANGELOG: CatalogChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-09-23',
    en: [
      'First catalog release: every farbrengen indexed by mafteiach.app from 5710 to 5752, with its recordings (JEM) and PDF links',
      'Catalog releases are now separate from app releases - the apps fetch a newer catalog on their own, no app update needed',
    ],
    he: [
      'מהדורת קטלוג ראשונה: כל התוועדות שתועדה ב-mafteiach.app משנת תש"י עד תשנ"ב, עם ההקלטות (JEM) וקישורי ה-PDF',
      'מהדורות הקטלוג נפרדות כעת ממהדורות האפליקציה - האפליקציות מורידות קטלוג חדש בעצמן, בלי עדכון אפליקציה',
    ],
  },
];
