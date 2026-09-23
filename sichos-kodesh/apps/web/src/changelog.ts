/** Bumped by hand alongside a real user-facing entry below - this app isn't
 * published anywhere version numbers matter on their own, so the only thing
 * that makes a version real is having something worth telling the user. */
export const APP_VERSION = '1.0.0';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. */
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
      'Search now tolerates typos and keyboard slips, in any word order',
      'Fixed pinch-to-zoom on PDFs snapping away from where you pinched',
      'Fixed the player losing its place on the lock screen while loading or skipping',
      "Fixed the scrubber jumping backward while you're dragging it",
      'Fixed a blank white screen on some older Android devices',
    ],
    he: [
      'החיפוש סובל כעת טעויות הקלדה וסדר מילים שונה',
      'תוקן זום בקבצי PDF שקפץ הרחק מנקודת הנגיעה',
      'תוקן הנגן שאיבד את מיקומו במסך הנעילה בזמן טעינה או דילוג',
      'תוקן פס ההתקדמות שקפץ אחורה תוך כדי גרירה',
      'תוקן מסך לבן וריק במכשירי אנדרואיד ישנים מסוימים',
    ],
  },
];
