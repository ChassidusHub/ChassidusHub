/** Bumped by hand alongside a real user-facing entry below - this app isn't
 * published anywhere version numbers matter on their own, so the only thing
 * that makes a version real is having something worth telling the user. */
export const APP_VERSION = '1.2.0';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    en: [
      'The list of farbrengens now updates on its own: the app checks api.sk.shmuky.dev once a day (and after every app update) for a newer catalog and applies it in place - a corrected date or a new recording no longer waits for an app release. Settings and About show which catalog you have',
      'Share and Download are now one matching pair of buttons on every occasion page; the recordings page keeps its download-all icon in the header and gets the same Share button',
      'A colours button in the PDF reader flips a document between black-on-white and white-on-black - the whole screen follows the page while you read, and the app returns to your own theme when you leave. Remembered separately for light and dark mode',
      'Playback speed for shiurim and chazaros (0.75× to 2×) - never for the Rebbe\'s own recordings, which always play as they were said',
    ],
    he: [
      'רשימת ההתוועדויות מתעדכנת כעת מעצמה: האפליקציה בודקת ב-api.sk.shmuky.dev פעם ביום (ואחרי כל עדכון אפליקציה) אם יש קטלוג חדש ומחילה אותו במקום - תאריך מתוקן או הקלטה חדשה כבר לא מחכים למהדורת אפליקציה. ההגדרות ו"אודות" מציגים איזה קטלוג יש לכם',
      'שיתוף והורדה הם כעת זוג כפתורים תואם בכל דף אירוע; דף ההקלטות שומר על סמל ההורדה שלו בכותרת ומקבל את אותו כפתור שיתוף',
      'כפתור צבעים בקורא ה-PDF הופך מסמך בין שחור-על-לבן ללבן-על-שחור - כל המסך עוקב אחרי העמוד בזמן הקריאה, והאפליקציה חוזרת לערכת הנושא שלכם ביציאה. נזכר בנפרד למצב בהיר ולמצב כהה',
      'מהירות ניגון לשיעורים ולחזרות (0.75× עד 2×) - לעולם לא להקלטות הרבי עצמו, שמתנגנות תמיד כפי שנאמרו',
    ],
  },
  {
    version: '1.1.0',
    en: [
      'Settings rebuilt: real switches and choices instead of check lists, grouped by what they do, with the current state readable on the Settings page itself',
      'Offline & downloads asks three plain questions - keep this week ready, what to keep, which year - with the rarely-needed options tucked behind Advanced, and a "Download this week now" button at the top',
      '"This occasion, every year" now finds the same farbrengen in each year - even when several share a date, or it fell on the eve one year and the day itself the next - and lists the rest of that date beneath it',
      'This Week and All Years no longer skip a second farbrengen on the same date',
      'Swipe the player down to shrink it, down again to put it away (playback pauses); swipe up on the handle at the bottom edge, or tap it, to bring it back',
    ],
    he: [
      'ההגדרות נבנו מחדש: מתגים ובחירות אמיתיים במקום רשימות סימון, מקובצים לפי מה שהם עושים, כשהמצב הנוכחי נקרא כבר בדף ההגדרות עצמו',
      '"לא מקוון והורדות" שואל שלוש שאלות פשוטות - השבוע מוכן מראש, מה לשמור, איזו שנה - האפשרויות הנדירות מאחורי "מתקדם", וכפתור "הורדת השבוע עכשיו" למעלה',
      '"אירוע זה, בכל השנים" מוצא כעת את אותה התוועדות בכל שנה - גם כשכמה חולקות תאריך, או כשהיא חלה בערב בשנה אחת וביום עצמו בשנה אחרת - ומציג את שאר האירועים של אותו תאריך מתחתיה',
      '"השבוע" ו"כל השנים" אינם מדלגים עוד על התוועדות שנייה באותו תאריך',
      'החלקה של הנגן למטה מקטינה אותו, החלקה נוספת מסלקת אותו (הניגון נעצר); החלקה למעלה על הידית בקצה התחתון, או נגיעה בה, מחזירה אותו',
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
