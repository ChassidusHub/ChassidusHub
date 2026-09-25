/** Bumped by hand alongside a real user-facing entry below - this app isn't
 * published anywhere version numbers matter on their own, so the only thing
 * that makes a version real is having something worth telling the user. */
export const APP_VERSION = '1.9.0';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.9.0',
    en: [
      'A new home: this week first - the parsha, the kvius farbrengens, every year\'s farbrengens of the week and the parsha\'s Likkutei Sichos - then where you left off, the farbrengens by year, moed and parsha, and a door into each part of the library',
      'One search for everything - the farbrengens, every part of the library and the seforim - with filters by year, month, day, parsha and moed for all of them. A sefer\'s name alone finds the sefer, not all its chapters',
      'Maamorim, reshimos and recordings by month across all the years, by parsha and by moed; and Sefer HaMaamorim Melukat in its edition by the months of the year, in four parts, beside the six volumes',
      'Short titles for long names: lists and headers show a short one, and the page itself the whole name. A long header wraps onto a second line instead of being cut short',
      'On a phone the reader\'s settings sheet follows your finger down and closes; the PDF reader has the same sheet for its pages: sepia, grey or dark, a stronger contrast, a page at a time, the screen kept on',
      'The letters of the Igros are laid out as the printed volumes set them: the date at the top, the city and the addressee indented under it, the greeting, paragraphs that open indented, and the signature at the end. Years, months and parshiyos are a grid of tiles',
      'Reading on: scroll up at the top of a chapter or a letter and the one before it is already there, with the page kept where it was - no more button for it. An addressee\'s lines are broken evenly, so a short word never stands alone on the last one',
      'Every page\'s header sits at the very top, steps away as you scroll down and comes back with a small scroll up; the back button sits level with the title',
    ],
    he: [
      'מסך בית חדש: קודם השבוע - הפרשה, התוועדויות הקביעות, התוועדויות השבוע בכל השנים ולקוטי שיחות על הפרשה - אחר כך היכן שהפסקתם, ההתוועדויות לפי שנה, מועד ופרשה, ודלת לכל חלק של הספרייה',
      'חיפוש אחד לכל - ההתוועדויות, כל חלקי הספרייה והספרים - עם סינון לפי שנה, חודש, יום, פרשה ומועד לכולם. שם של ספר לבדו מוצא את הספר, לא את כל פרקיו',
      'מאמרים, רשימות והקלטות לפי חודש בכל השנים, לפי פרשה ולפי מועד; וספר המאמרים מלוקט במהדורה לפי חודשי השנה, בארבעה חלקים, לצד ששת הכרכים',
      'כותרות קצרות לשמות ארוכים: הרשימות והכותרות מציגות שם קצר, והעמוד עצמו את השם המלא. כותרת ארוכה עוברת לשורה שנייה במקום להיקטע',
      'בטלפון, חלון הגדרות הקריאה נגרר למטה עם האצבע ונסגר; לקורא ה-PDF יש אותו חלון לדפים: ספיה, אפור או כהה, ניגודיות חזקה, דף אחר דף, מסך דולק',
      'מכתבי האגרות מסודרים כמו בכרכים המודפסים: התאריך למעלה, העיר והנמען בהזחה מתחתיו, הברכה, פסקאות שנפתחות בהזחה, והחתימה בסוף. שנים, חודשים ופרשות מוצגים כאריחים',
      'קריאה רציפה: גלילה למעלה בראש פרק או אגרת - והקודם כבר שם, והעמוד נשאר במקומו - בלי כפתור לזה. שורות הנמען נשברות באופן שווה, כך שמילה קצרה לא נשארת לבד בשורה האחרונה',
      'הכותרת של כל עמוד יושבת בראשו, זזה הצידה בגלילה למטה וחוזרת בגלילה קטנה למעלה; כפתור החזרה בגובה הכותרת',
    ],
  },
  {
    version: '1.8.0',
    en: [
      'Every recording has its Hebrew name in Hebrew, and so does each of its parts; the names of where a maamar was said, a sicha\'s parsha, the reshimos, the letters and the hadranim have their English in English',
      'A sicha of Likkutei Sichos names its parsha once, under its volume and page; a translation is "Translation", not "Translation · translated"',
      'The HebrewBooks lists are headed by the Rebbe\'s name, and each book is one line - its name and its pages. Where it was printed shows only to tell editions of one book apart',
      'The font picker shows its sample word whole in every font and at every text size: the ת of בראשית no longer falls to a second line',
    ],
    he: [
      'לכל הקלטה יש שם בעברית, וגם לכל אחד מחלקיה; לשמות של היכן נאמר מאמר, פרשת השיחה, הרשימות, המכתבים וההדרנים יש שם באנגלית',
      'שיחה בלקוטי שיחות מציינת את הפרשה פעם אחת, מתחת לחלק ולעמוד; תרגום נקרא "תרגום", לא "תרגום · מתורגם"',
      'רשימות HebrewBooks נפתחות בשם הרבי, וכל ספר הוא שורה אחת - שמו ומספר העמודים. מקום ההדפסה מופיע רק כדי להבחין בין מהדורות של אותו ספר',
      'בחירת הגופן מציגה את מילת הדוגמה שלמה בכל גופן ובכל גודל טקסט: ה-ת של בראשית כבר לא יורדת לשורה שנייה',
    ],
  },
  {
    version: '1.7.0',
    en: ['A chapter\'s edition is one control under its heading - the edition being read - that opens the list of the others, and of the ones read on Sefaria'],
    he: ['המהדורה של הפרק היא כפתור אחד מתחת לכותרת - המהדורה שנקראת - שפותח את רשימת האחרות, ואת אלה שנקראות בספריא'],
  },
  {
    version: '1.6.0',
    en: [
      'HebrewBooks: the scanned seforim of the Rebbeim on HebrewBooks.org, 1,539 of them, a tap away. Each sefer lists its own volumes (Likkutei Sichos, Toras Menachem, the Igros, Or HaTorah and more), each opening on its page at HebrewBooks',
      'Sichos Kodesh and the Rebbe\'s Sefer HaSichos join the seforim, as their scans',
      'Under each Rebbe, "More on HebrewBooks" lists his other books there, series by series, with a filter; "Chabad books on HebrewBooks" holds the yeshivos\' kovtzim and the Chassidim\'s seforim',
    ],
    he: [
      'HebrewBooks: הספרים הסרוקים של רבותינו נשיאינו באתר HebrewBooks.org, 1,539 מהם, בנגיעה. כל ספר מציג את הכרכים שלו (לקוטי שיחות, תורת מנחם, האגרות, אור התורה ועוד), וכל כרך נפתח בעמוד שלו ב-HebrewBooks',
      'שיחות קודש וספר השיחות של הרבי נוספו לספרים, כסריקות',
      'תחת כל רבי, "עוד ב-HebrewBooks" מציג את שאר ספריו שם, סדרה אחר סדרה, עם סינון; "ספרי חב״ד ב-HebrewBooks" מרכז את קובצי הישיבות וספרי החסידים',
    ],
  },
  {
    version: '1.5.0',
    en: [
      'Igros Kodesh: the Rebbe\'s letters to read, all 11,059 in 28 volumes, each with its date, its notes and where it is printed. The seforim > the Rebbe > Igros Kodesh opens them volume by volume; search finds a letter by its number',
      'The letters open in David, until you pick another font in the reading settings',
      'In a letter, the date line and the signature sit on the left, as in the printed volumes, and the volume\'s notes follow the letter. A letter once read opens again with no internet',
    ],
    he: [
      'אגרות קודש: אגרות הרבי לקריאה, כל 11,059 האגרות ב-28 חלקים, כל אחת עם התאריך, ההערות והמקום שבו נדפסה. ספרים > הרבי > אגרות קודש פותח אותן חלק אחר חלק; החיפוש מוצא אגרת לפי מספרה',
      'האגרות נפתחות בגופן דוד, עד שתבחרו גופן אחר בהגדרות הקריאה',
      'באגרת, שורת התאריך והחתימה בצד שמאל, כמו בכרכים המודפסים, והערות הכרך באות אחרי האגרת. אגרת שנקראה פעם נפתחת שוב גם בלי אינטרנט',
    ],
  },
  {
    version: '1.4.0',
    en: [
      'The whole library opens on the web too: the library, on the home page, has Likkutei Sichos by volume, parsha and moed, the maamorim, reshimos, yomanim, the general letters, hadranim and every JEM recording, and the farbrengens by moed and special day or by parsha. Each item plays and opens its PDFs here as on the phone - only the offline packs stay a phone feature',
      'Seforim: the Rebbeim and their seforim. Tanya, Likkutei Torah, Torah Or, the Shulchan Aruch HaRav and more read right here, chapter by chapter, in Hebrew and in English, with the next chapter following on at the end of each one',
      'A reader made for learning: Frank Ruehl, David, SBL Hebrew, Noto Serif or your device\'s font; text size, line spacing, margins, and the page - like the app, paper, sepia or night; vowels and cantillation on or off, justified text, the notes at the end or right in the text, and page markers on or off. The arrow keys turn the chapter',
      'A sefer reopens at the paragraph where you left it; the seforim page starts with what you read last and your bookmarks. Select a passage to copy or share it with the sefer, the chapter and a link',
      'Search in: pick the farbrengens or one of the library\'s collections, and find an item by its name or by where and when it was said',
      'About credits Sefaria, where the texts come from, and each of the reader\'s fonts with its licence',
    ],
    he: [
      'כל הספרייה נפתחת גם באתר: "הספרייה" בדף הבית מציגה לקוטי שיחות לפי כרך, פרשה ומועד, מאמרים, רשימות, יומנים, מכתבים כלליים, הדרנים וכל הקלטה של JEM, ואת ההתוועדויות לפי מועד ויום מיוחד או לפי פרשה. כל פריט מתנגן ופותח את קובצי ה-PDF שלו כאן כמו בטלפון - רק החבילות הלא מקוונות נשארות בטלפון',
      'ספרים: רבותינו נשיאינו וספריהם. תניא, לקוטי תורה, תורה אור, שולחן ערוך הרב ועוד נקראים ישר כאן, פרק אחר פרק, בעברית ובאנגלית, והפרק הבא ממשיך בסוף כל פרק',
      'קורא שנועד ללימוד: פרנק-ריהל, דוד, SBL עברית, נוטו סריף או הגופן של המכשיר; גודל האותיות, ריווח השורות, השוליים והדף - כמו האפליקציה, נייר, ספיה או לילה; ניקוד וטעמים לפי הבחירה, יישור לשני הצדדים, ההערות בסוף הפרק או בתוך הטקסט, וסימוני עמודים לפי הבחירה. מקשי החצים מעבירים פרק',
      'ספר נפתח בפסקה שבה הפסקתם; דף הספרים מתחיל במה שנלמד לאחרונה ובסימניות שלכם. סמנו קטע כדי להעתיק או לשתף אותו עם שם הספר, הפרק וקישור',
      '"חיפוש ב": בחרו בהתוועדויות או באחד מאוספי הספרייה, ומצאו פריט לפי שמו או לפי היכן ומתי נאמר',
      'במסך אודות: קרדיט לספריא, ממנה באים הטקסטים, ולכל אחד מגופני הקורא עם הרישיון שלו',
    ],
  },
  {
    version: '1.3.0',
    en: [
      'Names now follow the app\'s language: in English every occasion has its English name ("Rosh Hashanah, day 2", "Motzei 13 Tishrei") - lists, the occasion page, the player and the lock screen - and in Hebrew each recording\'s chapter is named in Hebrew ("שיחה א׳", "מאמר"). A name without a translation yet keeps its original',
      'Search finds an occasion by its English name too',
    ],
    he: [
      'השמות תואמים כעת את שפת האפליקציה: באנגלית לכל אירוע שם באנגלית ("Rosh Hashanah, day 2") - ברשימות, בדף האירוע, בנגן ובמסך הנעילה - ובעברית כל קטע בהקלטה נקרא בעברית ("שיחה א׳", "מאמר"). שם שעדיין אין לו תרגום נשאר כמקורו',
      'החיפוש מוצא אירוע גם לפי שמו באנגלית',
    ],
  },
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
