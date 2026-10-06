import type { Work } from '../types.js';

/**
 * Where each work's scans sit on the HebrewBooks shelf
 * (packages/hebrewbooks-index), kept by hand like the rest of the registry.
 * A series whose title is the work's own Hebrew title matches without an
 * entry here (`לקוטי שיחות`, `אור התורה`); these are the other names
 * HebrewBooks files a work's volumes under. Titles are compared the way the
 * shelf compares them (no quotes, the common spelling variants made one),
 * and only among the same author's books.
 */
export const HEBREWBOOKS_SERIES: Readonly<Record<string, readonly string[]>> = {
  // The Alter Rebbe
  tanya: ['לקוטי אמרים תניא'],
  'maamarei-admur-hazaken': ['מאמרי אדמו"ר הזקן'],
  'likkutei-torah': ['לקוטי תורה מספר במדבר', 'לקוטי תורה מספר דברים', 'לקוטי תורה מספר ויקרא', 'לקוטי תורה על מגילת שיר השירים'],
  'shulchan-aruch-harav': ['שלחן ערוך אורח חיים'],
  'igros-kodesh-alter-rebbe': ['אגרות קודש (אדמו"ר הזקן - האמצעי - הצמח צדק)'],
  // The Mitteler Rebbe
  'igros-kodesh-mitteler-rebbe': ['אגרות קודש (אדמו"ר האמצעי)'],
  'perush-hamilos': ['פירוש המילות הנקרא מהדורא בתרא', 'קונטרס פירוש המלות'],
  'shaarei-teshuvah': ['שער התשובה והתפלה'],
  // The Tzemach Tzedek
  'maamarei-admur-tzemach-tzedek': ['מאמרי אדמו"ר הצמח צדק'],
  'igros-kodesh-tzemach-tzedek': ['אגרות קודש (אדמו"ר ה"צמח צדק")'],
  'shut-tzemach-tzedek': ['צמח צדק'],
  'sefer-hachakirah': ['דרך אמונה'],
  // The Rebbe Maharash
  'toras-shmuel': ['לקוטי תורה תורת שמואל'],
  // The Rebbe Rashab
  'hemshech-ayin-beis': ['ספר המאמרים בשעה שהקדימו', 'בשעה שהקדימו', 'בשעה שהקדימו תער"ב חלק ד [הוצאת תשע"ט]'],
  'kuntres-umaayan': ['קונטרס ומעין מבית ד\''],
  'igros-kodesh-rebbe-rashab': ['אגרות קודש (אדמו"ר מוהרש"ב)'],
  // The Frierdiker Rebbe
  'igros-kodesh-frierdiker-rebbe': ['אגרות קודש (אדמו"ר מוהריי"צ)'],
  'sefer-hamaamarim-frierdiker-rebbe': [
    'ספר המאמרים קונטרסים',
    'ספר המאמרים קונטרסים חלק ראשון',
    'ספר המאמרים קונטרסים חלק שלישי',
    'ספר המאמרים אידיש',
    'ספר המאמרים אידיש (בלה"ק)',
    'ספר המאמרים תש"ד (בחלקה)',
  ],
  'sefer-hasichos-frierdiker-rebbe': ['ספר השיחות ה\'תש"ה (בחלקה)'],
  // The Rebbe
  'toras-menachem': ['תורת מנחם התוועדויות', 'תורת מנחם שנת', 'תורת מנחם שנת השי"ת'],
  'sefer-hamaamarim-melukat': ['ספר המאמרים מלוקט', 'תורת מנחם ספר המאמרים מלוקט'],
  'haggadah-likkutei-taamim': ['הגדה של פסח עם לקוטי טעמים ומנהגים', 'הגדה של פסח עם לקוטי טעמים מנהגים וביאורים', 'הגדה של פסח עם לקוטי מנהגים וטעמים'],
  'hayom-yom': ['היום יום בהוספת הערות וציונים', 'היום יום עם פענוח המראי מקומות'],
  hadranim: ['תורת מנחם הדרנים על הרמב"ם וש"ס'],
};

/**
 * The Rebbe's works HebrewBooks has and no other source lists (the plan's
 * section 3): scans to open, no text. Each is kept only when the shelf has
 * its scans.
 */
export const HEBREWBOOKS_ONLY: readonly Work[] = [
  { id: 'sichos-kodesh', title: { he: 'שיחות קודש', en: 'Sichos Kodesh' }, authors: ['the-rebbe'], genre: 'sichos', levels: ['year'], sources: [] },
  { id: 'sefer-hasichos-rebbe', title: { he: 'ספר השיחות', en: 'Sefer HaSichos (the Rebbe)' }, authors: ['the-rebbe'], genre: 'sichos', levels: ['year'], sources: [] },
];
