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
    version: '1.1.0',
    date: '2026-09-24',
    en: [
      'Every occasion now has its name in English too (e.g. "Rosh Hashanah, day 2", "Motzei 13 Tishrei") - 1,438 of the 1,454 distinct names; the rest keep their Hebrew',
      'Every recording\'s chapter name now has its Hebrew too (e.g. "שיחה א׳", "מאמר", "שני ניגונים") - 783 of the 785 distinct names',
    ],
    he: [
      'לכל אירוע יש כעת גם שם באנגלית (למשל "Rosh Hashanah, day 2") - 1,438 מתוך 1,454 השמות השונים; השאר נשארים בעברית',
      'לשם הקטע של כל הקלטה יש כעת גם שם בעברית (למשל "שיחה א׳", "מאמר", "שני ניגונים") - 783 מתוך 785 השמות השונים',
    ],
  },
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
