export { APP_VERSION } from './version';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. Same shape as apps/web/src/changelog.ts. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.3.0',
    en: [
      'Offline packs: Settings > Offline packs brings farbrengens onto the phone with no internet - a pack file (.skpack) from the yeshiva station or a friend, a shared ZIP, or a folder of recordings and PDFs. Every file is checked before it is saved, and what the phone already has is skipped',
      'Pick a shared folder once (Documents/SichosKodesh) and anything put in its "import" folder comes in on its own the next time you open the app',
      'Share a month or a year: what is on the phone goes into one ZIP file with Hebrew folder names, ready to pass on - another phone takes it in with "Import files"',
      'About lists the packs imported on this phone',
      'The library: Home > Library browses Likkutei Sichos by volume, parsha and moed; maamorim by year and by the six Melukat volumes; reshimos, yomanim, general letters, hadranim and every JEM recording - and the farbrengens by mafteiach\'s own moadim and parshiyos. Recordings play in the player, PDFs open in the reader',
      'Library items download like farbrengens, and Offline & downloads can keep them ready on its own: this week\'s parsha in Likkutei Sichos, this month\'s maamorim and yomanim, the current moed\'s letters - each a switch of its own',
    ],
    he: [
      'חבילות לא מקוונות: הגדרות > חבילות לא מקוונות מכניס התוועדויות לטלפון בלי אינטרנט - קובץ חבילה (.skpack) מעמדת הישיבה או מחבר, קובץ ZIP ששותף, או תיקייה של הקלטות וקובצי PDF. כל קובץ נבדק לפני שהוא נשמר, ומה שכבר יש בטלפון מדולג',
      'בוחרים פעם אחת תיקייה משותפת (Documents/SichosKodesh), וכל מה שמונח בתיקיית "import" שבה נכנס מעצמו בפעם הבאה שפותחים את האפליקציה',
      'שיתוף חודש או שנה: מה שיש בטלפון נכנס לקובץ ZIP אחד עם שמות תיקיות בעברית, מוכן להעברה - טלפון אחר מכניס אותו ב"ייבוא קבצים"',
      'במסך אודות מופיעות החבילות שיובאו לטלפון',
      'הספרייה: בית > הספרייה מציג את לקוטי שיחות לפי חלק, פרשה ומועד; מאמרים לפי שנה ולפי ששת חלקי המלוקט; רשימות, יומנים, מכתבים כלליים, הדרנים וכל הקלטה של JEM - ואת ההתוועדויות לפי המועדים והפרשיות של המפתח. ההקלטות מתנגנות בנגן, וקובצי ה-PDF נפתחים בקורא',
      'פריטי הספרייה יורדים כמו התוועדויות, ו"לא מקוון והורדות" יכול לשמור אותם מוכנים מעצמו: פרשת השבוע בלקוטי שיחות, המאמרים והיומנים של החודש, המכתבים של המועד - כל אחד במתג משלו',
    ],
  },
  {
    version: '1.2.0',
    en: [
      'The list of farbrengens now updates on its own: the phone checks api.sk.shmuky.dev once a day (also in the background) for a newer catalog and applies it in place - a corrected date or a new recording no longer waits for a new APK. "Update catalog" in Settings checks right now',
      'Automatic download is one switch again - the "Also when the app is closed" question is gone; the phone simply keeps the week ready, opened or not',
      'Share and Download are now one matching pair of buttons on every occasion page; the recordings page keeps its download-all icon in the header and gets the same Share button',
      'A colours button in the PDF reader flips a document between black-on-white and white-on-black - the whole screen follows the page while you read, and the app returns to your own theme when you leave. Remembered separately for light and dark mode',
      'Playback speed for shiurim and chazaros (0.75× to 2×) - never for the Rebbe\'s own recordings, which always play as they were said',
    ],
    he: [
      'רשימת ההתוועדויות מתעדכנת כעת מעצמה: הטלפון בודק ב-api.sk.shmuky.dev פעם ביום (גם ברקע) אם יש קטלוג חדש ומחיל אותו במקום - תאריך מתוקן או הקלטה חדשה כבר לא מחכים ל-APK חדש. "עדכון הקטלוג" בהגדרות בודק מיד',
      'ההורדה האוטומטית היא שוב מתג אחד - השאלה "גם כשהאפליקציה סגורה" הוסרה; הטלפון פשוט שומר את השבוע מוכן, פתוח או לא',
      'שיתוף והורדה הם כעת זוג כפתורים תואם בכל דף אירוע; דף ההקלטות שומר על סמל ההורדה שלו בכותרת ומקבל את אותו כפתור שיתוף',
      'כפתור צבעים בקורא ה-PDF הופך מסמך בין שחור-על-לבן ללבן-על-שחור - כל המסך עוקב אחרי העמוד בזמן הקריאה, והאפליקציה חוזרת לערכת הנושא שלכם ביציאה. נזכר בנפרד למצב בהיר ולמצב כהה',
      'מהירות ניגון לשיעורים ולחזרות (0.75× עד 2×) - לעולם לא להקלטות הרבי עצמו, שמתנגנות תמיד כפי שנאמרו',
    ],
  },
  {
    version: '1.1.0',
    en: [
      "This week's farbrengens download on their own from the first launch - on Wi-Fi, and every few hours while the app is closed - so the phone is ready offline without touching a setting",
      'Settings rebuilt: real switches and choices instead of check lists, grouped by what they do, with the current state readable on the Settings screen itself',
      'Offline & downloads asks three plain questions - keep this week ready, what to keep, which year - with the rarely-needed options tucked behind Advanced, and a "Download this week now" button at the top',
      '"This occasion, every year" now finds the same farbrengen in each year - even when several share a date, or it fell on the eve one year and the day itself the next - and lists the rest of that date beneath it',
      'This Week and All Years no longer skip a second farbrengen on the same date',
      'Swipe the player down to shrink it, down again to put it away (playback pauses); swipe up on the handle at the bottom edge, or tap it, to bring it back',
    ],
    he: [
      'התוועדויות השבוע יורדות מעצמן כבר מההפעלה הראשונה - ב-Wi-Fi, וכל כמה שעות גם כשהאפליקציה סגורה - כך שהטלפון מוכן לשימוש לא מקוון בלי לגעת בהגדרה',
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
