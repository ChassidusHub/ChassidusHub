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
    version: '1.7.0',
    date: '2026-09-25',
    en: [
      'Short titles for the long occasion names, in Hebrew and English (1,363 farbrengens, and the maamorim, reshimos, letters and hadranim with the longest names): lists and headers show the short one, and the page itself the whole name - who a yechidus was for, where the shluchim were going',
      'Maamorim, reshimos and JEM recordings by month across all the years, by parsha and by moed; and Sefer HaMaamorim Melukat in its edition by the months of the year, in four parts, beside the six volumes',
    ],
    he: [
      'כותרות קצרות לשמות הארוכים של המאורעות, בעברית ובאנגלית (1,363 התוועדויות, והמאמרים, הרשימות, המכתבים וההדרנים בעלי השמות הארוכים ביותר): הרשימות והכותרות מציגות את הקצר, והעמוד עצמו את השם המלא - למי הייתה היחידות, לאן נסעו השלוחים',
      'מאמרים, רשימות והקלטות JEM לפי חודש בכל השנים, לפי פרשה ולפי מועד; וספר המאמרים מלוקט במהדורה לפי חודשי השנה, בארבעה חלקים, לצד ששת הכרכים',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-09-24',
    en: [
      'Every JEM recording has its Hebrew name, and each of its chapters too (2,909 recordings, 8,142 chapters); mafteiach\'s occasions and names have their English: where each maamar was said, each sicha\'s parsha or moed, the reshimos, the letters and the hadranim',
    ],
    he: [
      'לכל הקלטה של JEM יש שם בעברית, וגם לכל אחד מחלקיה (2,909 הקלטות, 8,142 חלקים); למועדים ולשמות של mafteiach יש שם באנגלית: היכן נאמר כל מאמר, הפרשה או המועד של כל שיחה, הרשימות, המכתבים וההדרנים',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-24',
    en: [
      'The Chabad shelf of HebrewBooks.org: 1,539 scanned seforim, each linked to its page there. The seforim list their own volumes (689 scans), among them Sichos Kodesh and the Rebbe\'s Sefer HaSichos; the rest are under their author',
    ],
    he: [
      'מדף חב״ד של HebrewBooks.org: 1,539 ספרים סרוקים, כל אחד בקישור לעמוד שלו שם. הספרים מציגים את הכרכים שלהם (689 סריקות), וביניהם שיחות קודש וספר השיחות של הרבי; השאר תחת המחבר שלהם',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-09-24',
    en: [
      'Igros Kodesh of the Rebbe to read: 11,059 letters in 28 volumes, each with its date, its notes and where it is printed',
    ],
    he: [
      'אגרות קודש של הרבי לקריאה: 11,059 אגרות ב-28 חלקים, כל אחת עם התאריך, ההערות והמקום שבו נדפסה',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-09-24',
    en: [
      'The Rebbeim and their seforim: 80 works from the Baal Shem Tov to the Rebbe, each with where it can be read',
      'Nine seforim chapter by chapter from Sefaria (2,026 chapters): Tanya, Torah Or, Likkutei Torah, the Shulchan Aruch HaRav, Shaar HaYichud, Derech Mitzvosecha, the Siddur and more, each text with its licence and credit',
    ],
    he: [
      'רבותינו נשיאינו וספריהם: 80 ספרים מהבעל שם טוב ועד הרבי, וליד כל אחד היכן ניתן ללמוד בו',
      'תשעה ספרים פרק אחר פרק מספריא (2,026 פרקים): תניא, תורה אור, לקוטי תורה, שולחן ערוך הרב, שער היחוד, דרך מצוותיך, הסידור ועוד, כל טקסט עם הרישיון והקרדיט שלו',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-09-24',
    en: ['The library\'s 101 moadim and 53 parshiyos now have their English names too (e.g. "Rosh Chodesh Kislev", "Tzivos Hashem rally - Purim")'],
    he: ['ל-101 המועדים ול-53 הפרשיות שבספרייה יש כעת גם שמות באנגלית (למשל "Rosh Chodesh Kislev")'],
  },
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
