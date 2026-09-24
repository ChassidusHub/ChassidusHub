/** One letter of Igros Kodesh. Text fields are cleaned HTML unless named as plain. */
export interface IgrosLetter {
  /** `igros:3275`, `igros:141a` for a supplement (printed `קמא*`). */
  id: string;
  number: number;
  /** '' for a regular letter, 'a'/'b' for a supplement. */
  suffix: string;
  /** The letter's number as printed (`ג'ערה`, `קמא*`). */
  numberLabel: string;
  volume: number;
  /** The page in the printed volume, as printed (a Hebrew numeral), when the source has it. */
  bookPage: string | null;
  /** Plain text, e.g. `ב"ה, ט"ו שבט, תשט"ו`. */
  dateLine: string;
  /** The year the date line names (5715), when it names one. */
  hebrewYear: number | null;
  /** Plain text. */
  city: string;
  addressee: string;
  body: string;
  signature: string;
  /** The volume's notes on the letter. */
  notes: string;
  /** A one-line summary, plain text, when the source has one. */
  summary: string;
  /** The source's own row key (`idx`), kept to trace a letter back. */
  sourceKey: string;
}

/** One maaneh (a short reply, 5742-5752). */
export interface Maaneh {
  /** `maanos:5742:4`. */
  id: string;
  year: number;
  number: number;
  /** The number as printed (a Hebrew numeral). */
  numberLabel: string;
  /** Plain text, often bracketed (`[לאחר י"ג תשרי]`). */
  dateLine: string;
  body: string;
}

/** Something odd in the source, reported by the readers and never fatal. */
export interface SourceWarning {
  kind: 'number-mismatch' | 'no-number' | 'duplicate-id' | 'bad-volume' | 'bad-entry';
  where: string;
  detail: string;
}
