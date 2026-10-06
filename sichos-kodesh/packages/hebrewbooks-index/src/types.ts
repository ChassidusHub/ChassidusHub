/** One row of Otzaria's `hebrew_books` table: a book HebrewBooks.org holds as a scan. */
export interface HebrewBooksRow {
  /** HebrewBooks' own id: the book's page is hebrewbooks.org/<id>. */
  id: number;
  title: string;
  author: string | null;
  printingPlace: string | null;
  printingYear: string | null;
  pages: number | null;
  /** The catalog's subject tags (`חבד`, `שו"ת`...). */
  tags: string[];
}

/** One scan on the shelf: facts and a link, never the scan itself. */
export interface ShelfScan {
  id: number;
  /** The title as HebrewBooks lists it, quotes made Hebrew (״ ׳). */
  title: string;
  /** What sets it apart within its series: `חלק ג`, `תשמ״ה`. */
  volume?: string;
  /** Where and when it was printed, as listed: `ניו יורק, תשכ״ז`. */
  printed?: string;
  pages?: number;
}

/** The scans of one series: a sefer's volumes, or a single book. */
export interface ShelfSeries {
  /** The series title with its quotes and spaces made uniform, for matching (`לקוטי שיחות`). */
  key: string;
  /** The title to show: the one most of its scans use. */
  title: string;
  scans: ShelfScan[];
}

/** One author's books on the shelf; `authorId` null holds the Chabad books by anyone else. */
export interface ShelfAuthor {
  /** The works registry's author id (`the-rebbe`), or null. */
  authorId: string | null;
  series: ShelfSeries[];
}

/** The Chabad shelf of HebrewBooks, as read from one version of Otzaria's catalog. */
export interface HebrewBooksShelf {
  /** `db_meta.version` of the catalog it was read from. */
  catalogVersion: string;
  authors: ShelfAuthor[];
}
