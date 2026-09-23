export { APP_VERSION } from './version';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. Same shape as apps/web/src/changelog.ts. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    en: [
      '"This occasion, every year" now finds the same farbrengen in each year - even when several share a date, or it fell on the eve one year and the day itself the next - and lists the rest of that date beneath it',
      'This Week and All Years no longer skip a second farbrengen on the same date',
    ],
    he: [
      '"אירוע זה, בכל השנים" מוצא כעת את אותה התוועדות בכל שנה - גם כשכמה חולקות תאריך, או כשהיא חלה בערב בשנה אחת וביום עצמו בשנה אחרת - ומציג את שאר האירועים של אותו תאריך מתחתיה',
      '"השבוע" ו"כל השנים" אינם מדלגים עוד על התוועדות שנייה באותו תאריך',
    ],
  },
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
