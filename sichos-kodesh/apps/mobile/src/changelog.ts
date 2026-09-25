export { APP_VERSION } from './version';

interface ChangelogEntry {
  version: string;
  en: string[];
  he: string[];
}

/** Most recent first. Kept short and user-facing - not a commit log. Same shape as apps/web/src/changelog.ts. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.12.0',
    en: [
      'A new home: this week first - the parsha, the kvius farbrengens, every year\'s farbrengens of the week and the parsha\'s Likkutei Sichos - then where you left off, the farbrengens by year, moed and parsha, and a door into each part of the library',
      'Two ways to use the app, chosen at the first start and changed in Settings: online, with downloads and connection notices, or offline with packs, where none of that shows and the home asks for a pack. Importing a pack works in both',
      'One search for everything - the farbrengens, every part of the library and the seforim - with filters by year, month, day, parsha and moed for all of them, and the text of every sefer saved on the phone. A sefer\'s name alone finds the sefer, not all its chapters',
      'Maamorim, reshimos and recordings by month across all the years, by parsha and by moed; and Sefer HaMaamorim Melukat in its edition by the months of the year, in four parts, beside the six volumes',
      'Short titles for long names: lists and headers show a short one, and the page itself the whole name - who a yechidus was for, where the shluchim were going. A long header wraps onto a second line instead of being cut short',
      'The reader\'s settings sheet follows your finger down and closes; the PDF reader has the same sheet for its pages: sepia, grey or dark, a stronger contrast, a page at a time, the screen kept on',
      'The letters of the Igros are laid out as the printed volumes set them: the date at the top, the city and the addressee indented under it, the greeting, paragraphs that open indented, and the signature at the end. Years, months and parshiyos are a grid of tiles',
    ],
    he: [
      'מסך בית חדש: קודם השבוע - הפרשה, התוועדויות הקביעות, התוועדויות השבוע בכל השנים ולקוטי שיחות על הפרשה - אחר כך היכן שהפסקתם, ההתוועדויות לפי שנה, מועד ופרשה, ודלת לכל חלק של הספרייה',
      'שתי דרכים להשתמש באפליקציה, נבחרות בהפעלה הראשונה ומשתנות בהגדרות: מקוון, עם הורדות והודעות חיבור, או לא מקוון עם חבילות, שבו שום דבר מאלה לא מופיע ומסך הבית מבקש חבילה. ייבוא חבילה עובד בשתיהן',
      'חיפוש אחד לכל - ההתוועדויות, כל חלקי הספרייה והספרים - עם סינון לפי שנה, חודש, יום, פרשה ומועד לכולם, ובטקסט של כל ספר השמור בטלפון. שם של ספר לבדו מוצא את הספר, לא את כל פרקיו',
      'מאמרים, רשימות והקלטות לפי חודש בכל השנים, לפי פרשה ולפי מועד; וספר המאמרים מלוקט במהדורה לפי חודשי השנה, בארבעה חלקים, לצד ששת הכרכים',
      'כותרות קצרות לשמות ארוכים: הרשימות והכותרות מציגות שם קצר, והעמוד עצמו את השם המלא - למי הייתה היחידות, לאן נסעו השלוחים. כותרת ארוכה עוברת לשורה שנייה במקום להיקטע',
      'חלון הגדרות הקריאה נגרר למטה עם האצבע ונסגר; לקורא ה-PDF יש אותו חלון לדפים: ספיה, אפור או כהה, ניגודיות חזקה, דף אחר דף, מסך דולק',
      'מכתבי האגרות מסודרים כמו בכרכים המודפסים: התאריך למעלה, העיר והנמען בהזחה מתחתיו, הברכה, פסקאות שנפתחות בהזחה, והחתימה בסוף. שנים, חודשים ופרשות מוצגים כאריחים',
    ],
  },
  {
    version: '1.11.0',
    en: [
      'Made to work offline: once a pack is on the phone, no bar or note says there is no connection. Without a connection and without a pack, the app asks for the pack and opens where to import it',
      'Nothing shows as downloading unless it can download: with no connection, or no Wi-Fi when downloads are Wi-Fi only (the default), the downloads wait - no progress bar, no spinning rows - and carry on when the network is back. The app now reads the phone\'s own network state for this',
      'The font picker shows its sample word whole in every font and at every text size: the ת of בראשית no longer falls to a second line',
      'Every recording has its Hebrew name in Hebrew, and so does each of its parts; the names of where a maamar was said, a sicha\'s parsha, the reshimos, the letters and the hadranim have their English in English',
      'A sicha of Likkutei Sichos names its parsha once, under its volume and page; a translation is "Translation", not "Translation · translated"',
      'The HebrewBooks lists are headed by the Rebbe\'s name, which fits, and each book is one line - its name and its pages. Where it was printed shows only to tell editions of one book apart',
    ],
    he: [
      'בנויה לעבוד בלי חיבור: כשיש חבילה בטלפון, שום פס או הודעה לא אומרים שאין חיבור. בלי חיבור ובלי חבילה, האפליקציה מבקשת את החבילה ופותחת את המקום לייבא אותה',
      'שום דבר לא מוצג כיורד כשאי אפשר להוריד: בלי חיבור, או בלי Wi-Fi כשההורדות מוגדרות רק ב-Wi-Fi (ברירת המחדל), ההורדות ממתינות - אין פס התקדמות ואין שורות מסתובבות - וממשיכות כשהרשת חוזרת. האפליקציה קוראת לשם כך את מצב הרשת של הטלפון עצמו',
      'בחירת הגופן מציגה את מילת הדוגמה שלמה בכל גופן ובכל גודל טקסט: ה-ת של בראשית כבר לא יורדת לשורה שנייה',
      'לכל הקלטה יש שם בעברית, וגם לכל אחד מחלקיה; לשמות של היכן נאמר מאמר, פרשת השיחה, הרשימות, המכתבים וההדרנים יש שם באנגלית',
      'שיחה בלקוטי שיחות מציינת את הפרשה פעם אחת, מתחת לחלק ולעמוד; תרגום נקרא "תרגום", לא "תרגום · מתורגם"',
      'רשימות HebrewBooks נפתחות בשם הרבי, שנכנס בכותרת, וכל ספר הוא שורה אחת - שמו ומספר העמודים. מקום ההדפסה מופיע רק כדי להבחין בין מהדורות של אותו ספר',
    ],
  },
  {
    version: '1.10.0',
    en: [
      'Installs again on phones behind a filtering VPN: the app is packed so a filter can no longer change it on the way down (v1.8 and v1.9 showed "package appears to be invalid" there)',
      'The reader sets a Hebrew sefer right to left always, whatever the app language: a justified paragraph ends on the right, and a line opening with a number or an English word still starts there',
      'A chapter\'s edition is one control under its heading - the edition being read - that opens the list of the others, and of the ones read on Sefaria',
    ],
    he: [
      'ההתקנה עובדת שוב בטלפונים עם VPN מסנן: האפליקציה ארוזה כך שסינון כבר לא יכול לשנות אותה בדרך (בגרסאות 1.8 ו-1.9 הופיעה שם ההודעה "נראה שהחבילה לא תקינה")',
      'הקורא מציג ספר בעברית תמיד מימין לשמאל, בכל שפת אפליקציה: פסקה מיושרת מסתיימת בימין, ושורה שנפתחת במספר או במילה באנגלית עדיין מתחילה שם',
      'המהדורה של הפרק היא כפתור אחד מתחת לכותרת - המהדורה שנקראת - שפותח את רשימת האחרות, ואת אלה שנקראות בספריא',
    ],
  },
  {
    version: '1.9.0',
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
    version: '1.8.0',
    en: [
      'Packs in Opus: a pack of recordings in Opus 16 (about half the size of the originals, and to the ear the same) now imports and plays like any other - offline, with seeking and in the background. The download site offers Opus 16 first',
      'A recording that came in Opus counts as on the phone everywhere: its download mark, the Downloaded screen, storage use and "Delete"',
    ],
    he: [
      'חבילות ב-Opus: חבילת הקלטות ב-Opus 16 (בערך חצי מגודל המקור, ולאוזן אותו דבר) מיובאת ומתנגנת עכשיו כמו כל חבילה - בלי אינטרנט, עם דילוג ובניגון ברקע. אתר ההורדות מציע קודם את Opus 16',
      'הקלטה שהגיעה ב-Opus נחשבת בכל מקום כשמורה בטלפון: סימן ההורדה, מסך "הורדות", נפח האחסון ו"מחיקה"',
    ],
  },
  {
    version: '1.7.0',
    en: [
      'Igros Kodesh: the Rebbe\'s letters to read, all 11,059 in 28 volumes, each with its date, its notes and where it is printed. Library > Seforim > the Rebbe > Igros Kodesh opens them volume by volume; search finds a letter by its number',
      'The letters open in David, as the reader\'s own choice for them, until you pick another font in the Aa settings',
      'Save the Igros on the phone like any sefer (about 28 MB), to read with no internet and to search word by word',
      'In a letter, the date line and the signature sit on the left, as in the printed volumes, and the volume\'s notes follow the letter',
    ],
    he: [
      'אגרות קודש: אגרות הרבי לקריאה, כל 11,059 האגרות ב-28 חלקים, כל אחת עם התאריך, ההערות והמקום שבו נדפסה. ספרייה > ספרים > הרבי > אגרות קודש פותח אותן חלק אחר חלק; החיפוש מוצא אגרת לפי מספרה',
      'האגרות נפתחות בגופן דוד, עד שתבחרו גופן אחר בהגדרות Aa',
      'אפשר לשמור את האגרות בטלפון כמו כל ספר (כ-28 MB), לקריאה בלי אינטרנט ולחיפוש מילה במילה',
      'באגרת, שורת התאריך והחתימה בצד שמאל, כמו בכרכים המודפסים, והערות הכרך באות אחרי האגרת',
    ],
  },
  {
    version: '1.6.0',
    en: [
      'A new reader for the seforim: set in Frank Ruehl, David, SBL Hebrew or Noto Serif (or the phone\'s own font), each shipped in the app, so a sefer reads the same with no internet',
      'Reading settings (the Aa button): text size, line spacing, margins, and the page - like the app, paper, sepia or night. Vowels and cantillation on or off, justified as a printed sefer is set, the notes at the end or right in the text, page markers on or off',
      'Read straight on: at the end of a chapter the next one follows on the same page. The bar slides out of the way while reading, a thin line shows how far into the chapter you are, and the screen stays on while a sefer is open (each can be turned off)',
      'A sefer reopens at the very paragraph where it was left, not just its chapter',
      'Press and hold a paragraph to share it with its source: the sefer, the chapter and a link',
      'Packs signed with the app\'s own key are now trusted, so a text pack imports with its search index',
      'About credits each of the reader\'s fonts and its licence',
    ],
    he: [
      'קורא חדש לספרים: בגופן פרנק-ריהל, דוד, SBL עברית או נוטו סריף (או הגופן של הטלפון), כולם כלולים באפליקציה, כך שספר נראה אותו דבר גם בלי אינטרנט',
      'הגדרות קריאה (הכפתור Aa): גודל האותיות, ריווח השורות, השוליים והדף - כמו האפליקציה, נייר, ספיה או לילה. ניקוד וטעמים לפי הבחירה, יישור לשני הצדדים כמו בספר מודפס, ההערות בסוף הפרק או בתוך הטקסט, וסימוני עמודים לפי הבחירה',
      'להמשיך ישר: בסוף פרק הפרק הבא ממשיך באותו דף. הסרגל מתפנה בזמן הקריאה, קו דק מראה כמה מהפרק נקרא, והמסך נשאר דולק כל עוד ספר פתוח (כל אחד מהם אפשר לכבות)',
      'ספר נפתח בדיוק בפסקה שבה הפסקתם, לא רק בפרק',
      'לחיצה ארוכה על פסקה משתפת אותה עם המקור: הספר, הפרק וקישור',
      'חבילות שנחתמו במפתח של האפליקציה מקובלות עכשיו, כך שחבילת טקסט נכנסת עם אינדקס החיפוש שלה',
      'במסך אודות: קרדיט לכל אחד מהגופנים של הקורא ולרישיון שלו',
    ],
  },
  {
    version: '1.5.0',
    en: [
      'Seforim: Library > Seforim lists the Rebbeim and their seforim. Tanya, Likkutei Torah, Torah Or, the Shulchan Aruch HaRav, Derech Mitzvosecha and Maaneh Lashon read right in the app, chapter by chapter, in Hebrew and in English; a few more in English only, and the rest link to where they are read',
      'A reader for the seforim: Hebrew set right to left, footnotes that open with a tap, the text size of your choice, the next and previous chapter, and a bookmark on any chapter. Where a sefer has more than one edition (the Hebrew, an English translation), a tap switches between them',
      'Continue reading: the seforim page opens with the ones you read last, each at the chapter where you stopped, and then your bookmarks',
      'Save a sefer on the phone: one tap on its page saves every chapter from Sefaria, to read with no internet and to search word by word. Search finds any sefer or chapter by its name, and the words of every sefer saved on the phone',
      'About credits Sefaria, where the texts come from, and each edition\'s licence',
    ],
    he: [
      'ספרים: ספרייה > ספרים מציג את רבותינו נשיאינו וספריהם. תניא, לקוטי תורה, תורה אור, שולחן ערוך הרב, דרך מצוותיך ומענה לשון נקראים ישר באפליקציה, פרק אחר פרק, בעברית ובאנגלית; עוד כמה באנגלית בלבד, והשאר מקשרים למקום שבו קוראים אותם',
      'קורא לספרים: עברית מימין לשמאל, הערות שנפתחות בנגיעה, גודל אות לבחירתכם, הפרק הבא והקודם, וסימנייה על כל פרק. בספר שיש לו יותר ממהדורה אחת (העברית, תרגום לאנגלית), נגיעה מחליפה ביניהן',
      'המשך לימוד: דף הספרים נפתח בספרים שנלמדו לאחרונה, כל אחד בפרק שבו הפסקתם, ואחריהם הסימניות שלכם',
      'שמירת ספר בטלפון: נגיעה אחת בדף שלו שומרת את כל הפרקים מספריא, ללימוד בלי אינטרנט ולחיפוש מילה במילה. החיפוש מוצא כל ספר ופרק לפי שמו, ואת המילים של כל ספר ששמור בטלפון',
      'במסך אודות: קרדיט לספריא, ממנה באים הטקסטים, ולרישיון של כל מהדורה',
    ],
  },
  {
    version: '1.4.0',
    en: [
      'Search in the library: "Search in" picks Likkutei Sichos, maamorim, yomanim, the general letters, hadranim, reshimos or every JEM recording, and finds an item by its name or by where and when it was said - typos and missing quote marks included',
      'Search the farbrengens by mafteiach\'s own moadim and parshiyos: the Moed list has all 101 of its moadim and special days (Yud Shevat, a Tzivos Hashem rally, Kinus Hashluchim...), and a choice finds exactly the farbrengens mafteiach files there',
      'The moadim and parshiyos have English names in the English interface - in search and in Library > By moed and special day',
    ],
    he: [
      'חיפוש בספרייה: "חיפוש ב" בוחר לקוטי שיחות, מאמרים, יומנים, מכתבים כלליים, הדרנים, רשימות או כל הקלטה של JEM, ומוצא פריט לפי שמו או לפי היכן ומתי נאמר - גם עם טעות הקלדה ובלי גרשיים',
      'חיפוש ההתוועדויות לפי המועדים והפרשיות של המפתח עצמו: ברשימת המועדים כל 101 המועדים והימים המיוחדים שלו (יו"ד שבט, כינוס צבאות ה\', כינוס השלוחים...), ובחירה מוצאת בדיוק את ההתוועדויות שהמפתח משייך אליהם',
      'למועדים ולפרשיות יש שמות באנגלית בממשק האנגלי - בחיפוש ובספרייה > לפי מועד ויום מיוחד',
    ],
  },
  {
    version: '1.3.0',
    en: [
      'Offline packs: Settings > Offline packs brings farbrengens onto the phone with no internet - a pack file (.skpack) from the yeshiva station or a friend, a shared ZIP, or a folder of recordings and PDFs. Every file is checked before it is saved, and what the phone already has is skipped',
      'Pick a shared folder once (Documents/SichosKodesh) and anything put in its "import" folder comes in on its own the next time you open the app',
      'Share a month or a year: what is on the phone goes into one ZIP file with Hebrew folder names, ready to pass on - another phone takes it in with "Import files"',
      'About lists the packs imported on this phone',
      'The library: Home > Library browses Likkutei Sichos by volume, parsha and moed; maamorim by year and by the six Melukat volumes; reshimos, yomanim, general letters, hadranim and every JEM recording - and the farbrengens by mafteiach\'s own moadim and parshiyos. Recordings play in the player, PDFs open in the reader',
      'Library items download like farbrengens, and Offline & downloads can keep them ready on its own: this week\'s parsha in Likkutei Sichos, this month\'s maamorim and yomanim, the current moed\'s letters - each a switch of its own',
      'Names now follow the app\'s language: in English every occasion has its English name ("Rosh Hashanah, day 2", "Motzei 13 Tishrei") - lists, the occasion page, the player, the notification and the lock screen - and in Hebrew each recording\'s chapter is named in Hebrew ("שיחה א׳", "מאמר"), download notifications included. A name without a translation yet keeps its original',
      'Search finds an occasion by its English name too',
    ],
    he: [
      'חבילות לא מקוונות: הגדרות > חבילות לא מקוונות מכניס התוועדויות לטלפון בלי אינטרנט - קובץ חבילה (.skpack) מעמדת הישיבה או מחבר, קובץ ZIP ששותף, או תיקייה של הקלטות וקובצי PDF. כל קובץ נבדק לפני שהוא נשמר, ומה שכבר יש בטלפון מדולג',
      'בוחרים פעם אחת תיקייה משותפת (Documents/SichosKodesh), וכל מה שמונח בתיקיית "import" שבה נכנס מעצמו בפעם הבאה שפותחים את האפליקציה',
      'שיתוף חודש או שנה: מה שיש בטלפון נכנס לקובץ ZIP אחד עם שמות תיקיות בעברית, מוכן להעברה - טלפון אחר מכניס אותו ב"ייבוא קבצים"',
      'במסך אודות מופיעות החבילות שיובאו לטלפון',
      'הספרייה: בית > הספרייה מציג את לקוטי שיחות לפי חלק, פרשה ומועד; מאמרים לפי שנה ולפי ששת חלקי המלוקט; רשימות, יומנים, מכתבים כלליים, הדרנים וכל הקלטה של JEM - ואת ההתוועדויות לפי המועדים והפרשיות של המפתח. ההקלטות מתנגנות בנגן, וקובצי ה-PDF נפתחים בקורא',
      'פריטי הספרייה יורדים כמו התוועדויות, ו"לא מקוון והורדות" יכול לשמור אותם מוכנים מעצמו: פרשת השבוע בלקוטי שיחות, המאמרים והיומנים של החודש, המכתבים של המועד - כל אחד במתג משלו',
      'השמות תואמים כעת את שפת האפליקציה: באנגלית לכל אירוע שם באנגלית ("Rosh Hashanah, day 2") - ברשימות, בדף האירוע, בנגן, בהתראה ובמסך הנעילה - ובעברית כל קטע בהקלטה נקרא בעברית ("שיחה א׳", "מאמר"), גם בהתראות ההורדה. שם שעדיין אין לו תרגום נשאר כמקורו',
      'החיפוש מוצא אירוע גם לפי שמו באנגלית',
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
