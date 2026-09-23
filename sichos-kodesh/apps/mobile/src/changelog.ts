export { APP_VERSION } from './version';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. Same shape as apps/web/src/changelog.ts. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.0',
    en: [
      'First Android release',
      "This week's kvius-matched farbrengens, browsing by year, and search - the same catalog as the web app",
      'Recordings keep playing in the background, with lock-screen controls',
      'Downloads for offline listening and reading, with auto-download of the current week',
    ],
    he: [
      'גרסת אנדרואיד ראשונה',
      'התוועדויות השבוע לפי קביעות, עיון לפי שנה וחיפוש - אותו קטלוג כמו באפליקציית האינטרנט',
      'ההקלטות ממשיכות להתנגן ברקע, עם פקדים במסך הנעילה',
      'הורדות להאזנה וקריאה ללא חיבור, כולל הורדה אוטומטית של השבוע הנוכחי',
    ],
  },
];
