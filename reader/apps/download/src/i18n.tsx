import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The site in Hebrew (right to left, the default) or English (left to
 * right). The choice is kept in this browser; the page's `lang` and `dir`
 * follow it (index.html sets them before the first paint, so a reload
 * never flashes the other direction). Every word the site says is here;
 * names that come with the data (a pack's scope, a library group, a sefer)
 * carry both languages themselves.
 */

export type Lang = 'he' | 'en';

const STORAGE_KEY = 'chassidushub-pack-lang';

export function storedLang(): Lang {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'he' || value === 'en') return value;
  } catch {
    // Storage blocked: Hebrew.
  }
  return 'he';
}

function applyLang(lang: Lang, t: Strings): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = t.pageTitle;
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.pageDescription);
}

/** "קובץ אחד" / "12 קבצים"; "1 file" / "12 files". */
function countOf(lang: Lang, n: number, one: string, many: string): string {
  if (lang === 'he') return n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`;
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

function strings(lang: Lang) {
  const he = lang === 'he';
  const count = (n: number, heOne: string, heMany: string, enOne: string, enMany: string) => (he ? countOf('he', n, heOne, heMany) : countOf('en', n, enOne, enMany));
  return {
    lang,
    pageTitle: he ? 'ChassidusHub · חבילות לטלפון' : 'ChassidusHub · Packs for the phone',
    pageDescription: he ? 'הורדת התוועדויות, הנחות והקלטות לטלפון, כחבילה אחת חתומה.' : 'Farbrengens, hanachos, recordings and seforim for the phone, as one signed pack.',
    otherLang: he ? 'English' : 'עברית',
    otherLangLabel: he ? 'Switch to English' : 'להחליף לעברית',

    brand: 'ChassidusHub',
    navSite: he ? 'לאתר' : 'Website',
    navApp: he ? 'לאפליקציה' : 'The app',
    navCart: he ? 'לסל' : 'Cart',

    heroEyebrow: he ? 'חבילות להורדה' : 'Offline packs',
    heroTitle: he ? 'הכל בטלפון, גם בלי אינטרנט' : 'Everything on your phone, even offline',
    heroLead: he
      ? 'בוחרים מהמדפים - התוועדויות לפי שנים וחודשים, לקוטי שיחות, מאמרים, יומנים ומכתבים, והספרים עצמם - מוסיפים לסל, ומורידים הכל בחבילה אחת חתומה. האפליקציה מכניסה אותה בלי חיבור.'
      : 'Pick from the shelves - farbrengens by year and month, Likkutei Sichos, maamorim, yomanim and letters, and the seforim themselves - add them to the cart, and download it all as one signed pack. The app takes it in without a connection.',
    flowAdd: he ? 'מוסיפים לסל' : 'Add to the cart',
    flowDownload: he ? 'מורידים חבילה אחת' : 'Download one pack',
    flowPhone: he ? 'מעתיקים לטלפון' : 'Copy it to the phone',
    factsLabel: he ? 'בארכיון' : 'In the archive',
    recordings: (n: number) => count(n, 'הקלטה אחת', 'הקלטות', 'recording', 'recordings'),
    pdfs: (n: number) => count(n, 'קובץ PDF אחד', 'קבצי PDF', 'PDF', 'PDFs'),
    yearsSpan: (n: number, first: string, last: string) => (he ? `${n} שנים, ${first}–${last}` : `${n} years, ${first}–${last}`),
    yearsList: (list: string) => (he ? `שנים: ${list}` : `Years: ${list}`),
    updated: (date: string) => (he ? `עודכן ${date}` : `Updated ${date}`),

    storeTitle: he ? 'חבילה לפי בחירה' : 'Build your pack',
    storeLead: he ? 'שלושה שלבים: בוחרים מה לקחת, מחליטים מה נכנס ובאיזה גודל, ומורידים. הגודל המדויק לפני ההורדה.' : 'Three steps: choose what to take, decide what goes in and how big, and download. The exact size comes before the download.',
    loadingShelves: he ? 'טוענים את המדפים…' : 'Loading the shelves…',
    serverDown: (message: string) => (he ? `שרת החבילות אינו זמין כעת (${message}). נסו שוב בעוד רגע.` : `The pack server is not available right now (${message}). Try again in a moment.`),

    step: (n: number) => (he ? `שלב ${n}` : `Step ${n}`),
    step1Title: he ? 'בוחרים מה לקחת' : 'Choose what to take',
    step1Lead: he ? 'מכל מדף, כמה שרוצים. הכל נכנס לאותה חבילה.' : 'From any shelf, as much as you like. It all goes into the same pack.',
    step2Title: he ? 'מה נכנס ובאיזה גודל' : 'What goes in, and how big',
    step2Empty: he ? 'אחרי שמוסיפים משהו לסל.' : 'Once something is in the cart.',
    step3Title: he ? 'מורידים' : 'Download',
    change: he ? 'שינוי' : 'Change',
    done: he ? 'סיום' : 'Done',

    kviusEyebrow: (year: string) => (he ? `קביעות השנה · ${year}` : `This year's kvius · ${year}`),
    kviusTitle: (years: string) => (he ? `${years}: אותו לוח כמו השנה` : `${years}: the same calendar as this year`),
    kviusNone: he ? 'שנות הקביעות של השנה עוד לא בארכיון' : "This year's kvius years are not in the archive yet",
    kviusLead: (code: string) =>
      he ? `אותם ימים בשבוע, אותן פרשיות (קביעות ${code}). האפליקציה מלווה אותן שבוע אחר שבוע; כאן מוסיפים אותן לסל בנגיעה.` : `The same weekdays, the same parshiyos (kvius ${code}). The app follows them week by week; here they go into the cart in one tap.`,
    kviusWhichYears: he ? 'אילו שנים' : 'Which years',
    kviusWhichYearsHint: he ? 'כולן, או רק חלק מהן.' : 'All of them, or only some.',
    kviusNow: (month: string) => (he ? `${month}, החודש` : `${month}, this month`),
    kviusNext: (month: string) => (he ? `${month}, החודש הבא` : `${month}, next month`),
    kviusWhole: he ? 'השנה כולה' : 'The whole year',
    kviusChooseMonths: he ? 'בחירת חודשים…' : 'Choose months…',
    kviusCloseMonths: he ? 'סגירת החודשים' : 'Close the months',
    kviusMonthsHint: he ? 'המספר: כמה התוועדויות היו בחודש בשנות הקביעות שנבחרו.' : 'The number: how many farbrengens the kvius years picked had that month.',

    shelvesLabel: he ? 'מדפים' : 'Shelves',
    shelfFarbrengens: he ? 'התוועדויות' : 'Farbrengens',
    shelfLibrary: he ? 'הספרייה' : 'Library',

    years: he ? 'שנים' : 'Years',
    yearsHint: he ? 'אפשר כמה שנים: אותם חודשים מכל אחת.' : 'Several years take the same months of each.',
    allYears: he ? 'כל השנים' : 'All years',
    kviusYears: (n: number) => (he ? (n === 1 ? 'שנת הקביעות' : 'שנות הקביעות') : n === 1 ? 'The kvius year' : 'The kvius years'),
    kviusYearTitle: (year: string) => (he ? `שנת קביעות: הלוח שלה כמו ${year}` : `A kvius year: its calendar is ${year}'s`),
    kviusYearsTitle: (year: string) => (he ? `שנים שהלוח שלהן כמו ${year}` : `Years whose calendar is ${year}'s`),
    pickYears: he ? 'בחירת שנים…' : 'Choose years…',
    hideYears: he ? 'סגירת השנים' : 'Close the years',
    kviusLegend: he ? 'שנת קביעות: הלוח שלה כמו השנה' : "A kvius year: its calendar is this year's",
    months: he ? 'חודשים' : 'Months',
    monthsHint: he ? 'המספר ליד כל חודש: כמה התוועדויות היו בו.' : 'The number by each month: how many farbrengens it had.',
    wholeYear: he ? 'השנה כולה' : 'Whole year',
    flagNow: he ? 'החודש' : 'now',
    flagNext: he ? 'הבא' : 'next',
    loadingMonths: he ? 'טוען את חודשי השנה…' : "Loading the year's months…",
    nYears: (n: number) => (he ? `${n} שנים` : `${n} years`),

    addToCart: he ? 'הוספה לסל' : 'Add to cart',
    add: he ? 'הוספה' : 'Add',
    inCart: he ? 'בסל' : 'In the cart',

    libraryEmpty: he ? 'הספרייה עוד לא בארכיון: היא מתמלאת בימים אלה.' : 'The library is not in the archive yet: it is being filled these days.',
    loadingCollection: (name: string) => (he ? `טוענים את ${name}…` : `Loading ${name}…`),
    browseBy: he ? 'איך בוחרים' : 'Browse by',
    browseHint: (items: string) => (he ? `${items}, מסודרים כמו באפליקציה.` : `${items}, arranged as in the app.`),
    groupsHint: (many: string) => (he ? `אפשר כמה. המספר: כמה ${many} יש בכל אחד.` : `Pick any. The number: how many ${many} each has.`),
    groupsLabel: he ? 'קבוצות' : 'Groups',
    pickFirst: he ? 'בוחרים קודם' : 'Pick first',
    nGroups: (n: number) => (he ? `${n} קבוצות` : `${n} groups`),

    rebbeimSeforim: he ? 'ספרי רבותינו נשיאינו' : 'Seforim of the Rebbeim',
    workLead: he ? 'הטקסט המלא, לקריאה ולחיפוש בלי אינטרנט. בוחרים חלקים, או לוקחים את הספר כולו.' : 'The full text, to read and search offline. Pick parts, or take the whole sefer.',
    seforimLead: he ? 'כל ספר עם הטקסט המלא והחיפוש, לקריאה בלי אינטרנט. הם נכנסים לאותה חבילה עם כל השאר.' : 'Each sefer with its full text and search, to read offline. They go into the same pack as everything else.',
    rebbeLabel: he ? 'לפי רבי' : 'By Rebbe',
    otherSeforim: he ? 'עוד ספרים' : 'More seforim',
    allOf: (name: string) => (he ? `כל הספרים של ${name}` : `All of ${name}'s seforim`),
    allOfOther: he ? 'כל הספרים האלה' : 'All these seforim',
    wholeSefer: he ? 'הספר כולו' : 'The whole sefer',
    chooseParts: (n: number) => (he ? `בחירה מתוך ${n} חלקים…` : `Choose from ${n} parts…`),
    closeParts: he ? 'סגירה' : 'Close',
    addParts: (n: number) => (he ? (n === 1 ? 'הוספת חלק אחד' : `הוספת ${n} חלקים`) : n === 1 ? 'Add 1 part' : `Add ${n} parts`),
    partsNote: he ? 'חלקים נכנסים בלי מאגר החיפוש של הספר; הוא בא עם הספר כולו.' : "Parts come without the sefer's search index; it comes with the whole sefer.",
    partsOf: (title: string, parts: string) => `${title} (${parts})`,
    nParts: (n: number) => (he ? `${n} חלקים` : `${n} parts`),
    seforimDetail: he ? 'ספרים: הטקסט המלא' : 'Seforim: the full text',

    cart: he ? 'הסל' : 'Cart',
    emptyCart: he ? 'ריקון' : 'Empty',
    cartEmpty: he ? 'הסל ריק. מוסיפים מהמדפים - התוועדויות לפי שנים וחודשים, ומהספרייה - והכל יורד בחבילה אחת.' : 'The cart is empty. Add from the shelves - farbrengens by year and month, and the library - and it all comes down as one pack.',
    removeFromCart: (title: string) => (he ? `להוציא מהסל: ${title}` : `Remove from the cart: ${title}`),
    notArchived: he ? 'עוד לא בארכיון' : 'Not archived yet',
    retry: he ? 'שוב' : 'Retry',

    presetTitle: he ? 'מה מכל התוועדות' : 'What from each farbrengen',
    presets: {
      essentials: { label: he ? 'העיקר' : 'The essentials', note: he ? 'ההקלטות וההנחות - מה שעמוד ההתוועדות נפתח בו.' : 'The recordings and hanachos - what a farbrengen page opens on.' },
      everything: { label: he ? 'הכל' : 'Everything', note: he ? 'ההקלטות וההנחות, ועמן המוגה, המאמרים, ההגהות וההוספות.' : 'The recordings and hanachos, with the mugah, maamorim, hagahos and hosafos.' },
      custom: { label: he ? 'בחירה' : 'Custom', note: he ? 'בוחרים בדיוק מה ייכנס מכל התוועדות.' : 'Choose exactly what comes from each farbrengen.' },
    },
    sections: {
      audio: he ? 'הקלטות' : 'Recordings',
      sichosKodesh: he ? 'הנחות - שיחות קודש' : 'Hanachos - Sichos Kodesh',
      torasMenachem: he ? 'הנחות - תורת מנחם' : 'Hanachos - Toras Menachem',
      mugah: he ? 'מוגה' : 'Mugah',
      maamorim: he ? 'מאמרים' : 'Maamorim',
      hagahos: he ? 'הגהות' : 'Hagahos',
      hosofos: he ? 'הוספות' : 'Hosafos',
    },
    qualityTitle: he ? 'איכות השמע' : 'Audio quality',
    maxTitle: he ? 'גודל קובץ מרבי' : 'Largest file',
    maxHint: he ? 'חבילה גדולה יותר מתחלקת לכמה קבצים.' : 'A bigger pack is split into several files.',

    pickContent: he ? 'בחרו לפחות סוג תוכן אחד להתוועדויות.' : 'Pick at least one kind of content for the farbrengens.',
    sizing: he ? 'מחשבים את הגודל…' : 'Working out the size…',
    sizeNotArchived: he ? 'את זה הארכיון עוד לא מחזיק: הוא מתמלא בימים אלה. אפשר להוריד מהסל את מה שחסר, או לחזור מאוחר יותר.' : 'The archive does not hold this yet: it is being filled these days. Take what is missing out of the cart, or come back later.',
    sizeFailed: he ? 'לא הצלחנו לחשב את הגודל: השרת לא ענה. נסו שוב בעוד רגע.' : 'The size could not be worked out: the server did not answer. Try again in a moment.',
    sizeRetry: he ? 'לחשב שוב' : 'Try again',
    thePack: he ? 'החבילה' : 'The pack',
    items: (n: number) => count(n, 'פריט אחד', 'פריטים', 'item', 'items'),
    works: (n: number) => count(n, 'ספר אחד', 'ספרים', 'sefer', 'seforim'),
    files: (n: number) => count(n, 'קובץ אחד', 'קבצים', 'file', 'files'),
    missing: (n: number) => (he ? `${n === 1 ? 'קובץ אחד עדיין אינו' : `${n.toLocaleString('he-IL')} קבצים עדיין אינם`} בארכיון, ולא ייכללו.` : `${countOf('en', n, 'file is', 'files are')} not in the archive yet and will be left out.`),
    signed: he ? 'חתומה: האפליקציה בודקת כל קובץ לפני שהוא נכנס.' : 'Signed: the app checks every file before it goes in.',
    unsigned: he ? 'שרת זה אינו חותם על חבילות: האפליקציה תקבל את הקבצים אחד-אחד.' : 'This server does not sign packs: the app will take the files one by one.',
    partOf: (i: number, n: number) => (he ? `חלק ${i} מתוך ${n}` : `Part ${i} of ${n}`),
    onePack: he ? 'חבילה אחת' : 'One pack',
    download: he ? 'הורדה' : 'Download',
    partsHint: he ? 'כל חלק הוא חבילה שלמה: אפשר להוריד רק חלק מהם, ולהשלים אחר כך.' : 'Each part is a whole pack: download only some of them, and the rest later.',

    cartBarItems: (n: number) => count(n, 'פריט אחד בסל', 'פריטים בסל', 'item in the cart', 'items in the cart'),
    cartBarGo: he ? 'לסל ולהורדה' : 'To the cart',

    readyTitle: he ? 'חבילות מוכנות' : 'Ready packs',
    readyLead: he ? 'חודש שלם, מוכן להורדה מיידית.' : 'A whole month, ready to download now.',
    recommended: he ? 'מומלץ' : 'Recommended',

    importTitle: he ? 'איך מכניסים לטלפון' : 'Getting it onto the phone',
    appTitle: he ? 'האפליקציה לאנדרואיד' : 'The Android app',
    appVersion: (v: string) => (he ? `גרסה ${v}` : `Version ${v}`),
    appNewest: he ? 'הגרסה החדשה ביותר' : 'The newest version',
    appNote: he ? 'מותקנת מעל גרסה קודמת, עם כל ההורדות וההגדרות, והאפליקציה מודיעה בעצמה כשיוצאת גרסה חדשה.' : 'It installs over an older version, keeping every download and setting, and tells you itself when a new version is out.',
    app32: he ? 'לטלפון ישן (32 ביט)' : 'For an older phone (32-bit)',
    appUniversal: he ? 'קובץ אחד לכל טלפון' : 'One file for any phone',
    appDownload: he ? 'הורדת האפליקציה' : 'Download the app',
    appEyebrow: he ? 'לאנדרואיד' : 'For Android',
    appHeroTitle: he ? 'ChassidusHub בטלפון' : 'ChassidusHub on your phone',
    appHeroLead: he
      ? 'ההתוועדויות לפי הקביעות, ההקלטות, הכתבים והספרים, גם בלי אינטרנט.'
      : 'The farbrengens by kvius, the recordings, the hanachos and the seforim, even offline.',
    appWeb: he ? 'או באתר, בלי התקנה' : 'Or on the web, nothing to install',
    appInstallNote: he ? 'אם הטלפון שואל אם להתיר התקנה מהדפדפן, מתירים פעם אחת.' : 'If the phone asks whether to allow installing from the browser, allow it once.',
    importSteps: [
      { title: he ? 'בוחרים תיקייה באפליקציה' : 'Choose a folder in the app', body: he ? 'הגדרות ← חבילות לא מקוונות ← בוחרים תיקייה. מומלץ Documents/ChassidusHub.' : 'Settings → Offline packs → Choose a folder. Documents/ChassidusHub is a good one.' },
      { title: he ? 'מעתיקים את החבילה' : 'Copy the pack', body: he ? 'את קובץ ה-‎.skpack לתיקיית import שבתוכה: בכבל, מכרטיס זיכרון או מכל מקום אחר.' : 'Put the .skpack file in its import folder: by cable, from a memory card, or any other way.' },
      { title: he ? 'פותחים את האפליקציה' : 'Open the app', body: he ? 'החבילה נכנסת מעצמה. כל קובץ נבדק, ומה שכבר יש בטלפון מדולג.' : 'The pack goes in by itself. Every file is checked, and what the phone already has is skipped.' },
    ],
    importTip: he ? 'אפשר גם ״ייבוא קבצים״ באותו מסך, ולבחור את הקובץ ישירות.' : 'Or use "Import files" on the same screen, and pick the file directly.',

    footerLine: he ? 'החבילות חתומות, והאפליקציה בודקת כל קובץ לפני שהוא נכנס.' : 'The packs are signed, and the app checks every file before it goes in.',
    footerApp: he ? 'האפליקציה לאנדרואיד' : 'The Android app',
    footerSite: he ? 'האתר' : 'The website',
  };
}

export type Strings = ReturnType<typeof strings>;

interface LangState {
  lang: Lang;
  t: Strings;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);
  const t = useMemo(() => strings(lang), [lang]);
  useEffect(() => applyLang(lang, t), [lang, t]);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts as long as the page.
    }
  };
  return <LangContext.Provider value={{ lang, t, setLang }}>{children}</LangContext.Provider>;
}

export function useI18n(): LangState {
  const state = useContext(LangContext);
  if (!state) throw new Error('useI18n outside LangProvider');
  return state;
}

/** The strings of a language outside React (tests, the cart's labels). */
export function stringsFor(lang: Lang): Strings {
  return strings(lang);
}
