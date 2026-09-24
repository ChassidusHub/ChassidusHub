import type { Author } from '../types.js';

/**
 * The authors the registry names, curated by hand (the plan's section 5).
 * The Rebbeim and their teachers for now; the Chassidim's works carry an
 * empty author list until each is curated.
 */
export const AUTHORS: readonly Author[] = [
  { id: 'baal-shem-tov', name: { he: 'הבעל שם טוב', en: 'The Baal Shem Tov' } },
  { id: 'maggid', name: { he: 'הרב המגיד ממעזריטש', en: 'The Maggid of Mezritch' } },
  { id: 'alter-rebbe', name: { he: 'אדמו״ר הזקן', en: 'The Alter Rebbe' }, rebbe: 1 },
  { id: 'mitteler-rebbe', name: { he: 'אדמו״ר האמצעי', en: 'The Mitteler Rebbe' }, rebbe: 2 },
  { id: 'tzemach-tzedek', name: { he: 'אדמו״ר ה״צמח צדק״', en: 'The Tzemach Tzedek' }, rebbe: 3 },
  { id: 'rebbe-maharash', name: { he: 'אדמו״ר מהר״ש', en: 'The Rebbe Maharash' }, rebbe: 4 },
  { id: 'rebbe-rashab', name: { he: 'אדמו״ר מוהרש״ב', en: 'The Rebbe Rashab' }, rebbe: 5 },
  { id: 'frierdiker-rebbe', name: { he: 'אדמו״ר מוהריי״צ', en: 'The Frierdiker Rebbe' }, rebbe: 6 },
  { id: 'the-rebbe', name: { he: 'כ״ק אדמו״ר', en: 'The Rebbe' }, rebbe: 7 },
];

/** The chabadlibrary.org group whose works each author wrote. */
export const AUTHOR_BY_LIBRARY_GROUP: Readonly<Record<number, string>> = {
  100000000: 'baal-shem-tov',
  200000000: 'maggid',
  500000000: 'alter-rebbe',
  600000000: 'mitteler-rebbe',
  700000000: 'tzemach-tzedek',
  800000000: 'rebbe-maharash',
  900000000: 'rebbe-rashab',
  1000000000: 'frierdiker-rebbe',
  1100000000: 'the-rebbe',
};
