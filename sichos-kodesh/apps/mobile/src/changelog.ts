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
      'Settings rebuilt: real switches and choices instead of check lists, grouped by what they do, with the current state readable on the Settings screen itself',
      'Offline & downloads asks three plain questions - keep this week ready, what to keep, which year - with the rarely-needed options tucked behind Advanced, and a "Download this week now" button at the top',
      '"This occasion, every year" now finds the same farbrengen in each year - even when several share a date, or it fell on the eve one year and the day itself the next - and lists the rest of that date beneath it',
      'This Week and All Years no longer skip a second farbrengen on the same date',
      'Swipe the player down to shrink it, down again to put it away (playback pauses); swipe up on the handle at the bottom edge, or tap it, to bring it back',
    ],
    he: [
      'ההגדרות נבנו מחדש: מתגים ובחירות אמיתיים במקום רשימות סימון, מקובצים לפי מה שהם עושים, כשהמצב הנוכחי נקרא כבר במסך ההגדרות עצמו',
      '"לא מקוון והורדות" שואל שלוש שאלות פשוטות - השבוע מוכן מראש, מה לשמור, איזו שנה - האפשרויות הנדירות מאחורי "מתקדם", וכפתור "הורדת השבוע עכשיו" למעלה',
      '"אירוע זה, בכל השנים" מוצא כעת את אותה התוועדות בכל שנה - גם כשכמה חולקות תאריך, או כשהיא חלה בערב בשנה אחת וביום עצמו בשנה אחרת - ומציג את שאר האירועים של אותו תאריך מתחתיה',
      '"השבוע" ו"כל השנים" אינם מדלגים עוד על התוועדות שנייה באותו תאריך',
      'החלקה של הנגן למטה מקטינה אותו, החלקה נוספת מסלקת אותו (הניגון נעצר); החלקה למעלה על הידית בקצה התחתון, או נגיעה בה, מחזירה אותו',
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
