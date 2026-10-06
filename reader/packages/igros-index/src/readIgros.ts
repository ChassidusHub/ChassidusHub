import { DatabaseSync } from 'node:sqlite';
import { cleanHtml, htmlToText } from './cleanHtml.js';
import { parseLetterNumber, yearFromDateLine } from './hebrewNumeral.js';
import type { IgrosLetter, SourceWarning } from './types.js';

interface IgroysRow {
  rowid: number;
  Page_number: unknown;
  Igroys_bsd: unknown;
  Igroys_city: unknown;
  Igroys_address: unknown;
  Igroys_text: unknown;
  Igroys_signature: unknown;
  Igroys_comment: unknown;
  idx: unknown;
  vol: unknown;
  summary: unknown;
  book_page: unknown;
}

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/** `141a` -> {141, 'a'}; the source's own key, used only when the printed numeral is missing. */
function parseSourceKey(key: string): { number: number; suffix: string } | null {
  const match = key.trim().match(/^(\d+)([a-z]?)$/);
  return match ? { number: Number(match[1]), suffix: match[2]! } : null;
}

export interface ReadIgrosResult {
  letters: IgrosLetter[];
  warnings: SourceWarning[];
}

/**
 * Every letter in the source's `Igroys1` table, in volume order and the
 * source's order within a volume (the printed order).
 *
 * A letter's number comes from its printed numeral (`Page_number`), not
 * the source's `idx`: `idx` has data-entry slips (`ד'ערה`, 4275, stored as
 * 3275, which is also a real letter), so the numeral is the one that makes
 * every id unique. Where the two disagree the letter keeps the numeral's
 * number and a `number-mismatch` warning names both.
 */
export function readIgros(dbPath: string): ReadIgrosResult {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT rowid, Page_number, Igroys_bsd, Igroys_city, Igroys_address, Igroys_text, Igroys_signature,
                Igroys_comment, idx, vol, summary, book_page
         FROM Igroys1 ORDER BY CAST(vol AS INTEGER), rowid`,
      )
      .all() as unknown as IgroysRow[];
    const letters: IgrosLetter[] = [];
    const warnings: SourceWarning[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const where = `row ${row.rowid}`;
      const volume = Number.parseInt(text(row.vol), 10);
      if (!Number.isInteger(volume) || volume < 1) {
        warnings.push({ kind: 'bad-volume', where, detail: `vol ${JSON.stringify(text(row.vol))}; skipped` });
        continue;
      }
      const sourceKey = text(row.idx).trim();
      const printed = parseLetterNumber(htmlToText(text(row.Page_number)));
      const fromKey = parseSourceKey(sourceKey);
      let number: number;
      let suffix: string;
      let numberLabel: string;
      if (printed) {
        ({ number, suffix, label: numberLabel } = printed);
        if (!fromKey || fromKey.number !== number || fromKey.suffix !== suffix) {
          warnings.push({ kind: 'number-mismatch', where: `${where}, vol ${volume}`, detail: `printed ${numberLabel} = ${number}${suffix}, source key ${JSON.stringify(sourceKey)}` });
        }
      } else if (fromKey) {
        ({ number, suffix } = fromKey);
        numberLabel = '';
        warnings.push({ kind: 'no-number', where: `${where}, vol ${volume}`, detail: `no printed numeral; used the source key ${sourceKey}` });
      } else {
        warnings.push({ kind: 'no-number', where: `${where}, vol ${volume}`, detail: 'neither a printed numeral nor a source key; skipped' });
        continue;
      }

      let id = `igros:${number}${suffix}`;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}-${n}`)) n += 1;
        warnings.push({ kind: 'duplicate-id', where: `${where}, vol ${volume}`, detail: `${id} already taken; this one is ${id}-${n}` });
        id = `${id}-${n}`;
      }
      seen.add(id);

      const bookPage = htmlToText(text(row.book_page));
      const dateLine = htmlToText(text(row.Igroys_bsd)).replace(/\n/g, ' ');
      letters.push({
        id,
        number,
        suffix,
        numberLabel,
        volume,
        bookPage: bookPage || null,
        dateLine,
        hebrewYear: yearFromDateLine(dateLine),
        city: htmlToText(text(row.Igroys_city)).replace(/\n/g, ' '),
        addressee: cleanHtml(text(row.Igroys_address)),
        body: cleanHtml(text(row.Igroys_text)),
        signature: cleanHtml(text(row.Igroys_signature)),
        notes: cleanHtml(text(row.Igroys_comment)),
        summary: htmlToText(text(row.summary)).replace(/\n/g, ' '),
        sourceKey,
      });
    }
    return { letters, warnings };
  } finally {
    db.close();
  }
}

/** Letters grouped by volume, volumes ascending. */
export function lettersByVolume(letters: readonly IgrosLetter[]): Map<number, IgrosLetter[]> {
  const byVolume = new Map<number, IgrosLetter[]>();
  for (const letter of letters) {
    const list = byVolume.get(letter.volume) ?? [];
    list.push(letter);
    byVolume.set(letter.volume, list);
  }
  return new Map([...byVolume].sort((a, b) => a[0] - b[0]));
}
