import type { IgrosLetter, Maaneh } from './types.js';

/**
 * The text object for one letter or maaneh: a small HTML fragment in the
 * reader's own form (packages/app-core's textObject.ts), the same bytes for
 * the same record on every build, so its sha256 is its identity - the
 * archive stores it once, and the catalog API serves it at that sha256.
 *
 *   <article dir="rtl" lang="he" data-id>
 *     <p class="end">date line</p> <p class="end">city</p>   set to the end side, as printed
 *     the addressee's, the body's and the signature's paragraphs (the signature's set to the end side)
 *     <aside class="notes"><p>...</p></aside>                the volume's notes on the letter
 *     <footer class="source">where it is printed</footer>
 *   </article>
 *
 * The notes are not pointed to from the letter: the reader lists them after it.
 */
export const TEXT_OBJECT_MIME = 'text/html; charset=utf-8';

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;');
}

function endLine(text: string): string {
  return text ? `<p class="end">${escapeText(text)}</p>` : '';
}

/** Cleaned HTML (packages/igros-index's cleanHtml: attribute-free tags) with each paragraph set to the end side. */
function endParagraphs(html: string): string {
  return html.replace(/<p>/g, '<p class="end">');
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/**
 * A number from 1 to 999 as a Hebrew numeral: bare (`כח`, `טו`) or, with
 * `marks`, with a geresh or gershayim as a year is written (`תשמ״ב`).
 */
export function hebrewNumeral(n: number, marks = false): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const rest = n % 100;
  const tail = rest === 15 ? 'טו' : rest === 16 ? 'טז' : TENS[Math.floor(rest / 10)]! + ONES[rest % 10]!;
  const bare = HUNDREDS[Math.floor(n / 100)]! + tail;
  if (!marks) return bare;
  return bare.length === 1 ? `${bare}׳` : `${bare.slice(0, -1)}״${bare.slice(-1)}`;
}

/** Where a letter is printed: `אגרות קודש חלק א, אגרת ו, עמ׳ טו`. */
export function letterSource(letter: IgrosLetter): string {
  const parts = [`אגרות קודש חלק ${hebrewNumeral(letter.volume)}`, `אגרת ${letter.numberLabel}`];
  if (letter.bookPage) parts.push(`עמ׳ ${letter.bookPage}`);
  return parts.join(', ');
}

export function letterHtml(letter: IgrosLetter): string {
  return (
    `<article dir="rtl" lang="he" data-id="${escapeAttribute(letter.id)}">` +
    endLine(letter.dateLine) +
    endLine(letter.city) +
    letter.addressee +
    letter.body +
    endParagraphs(letter.signature) +
    (letter.notes ? `<aside class="notes">${letter.notes}</aside>` : '') +
    `<footer class="source">${escapeText(letterSource(letter))}</footer>` +
    `</article>\n`
  );
}

export function maanehHtml(maaneh: Maaneh): string {
  return (
    `<article dir="rtl" lang="he" data-id="${escapeAttribute(maaneh.id)}">` +
    endLine(maaneh.dateLine) +
    maaneh.body +
    `<footer class="source">${escapeText(`מענות ${hebrewNumeral(maaneh.year % 1000, true)}, ${maaneh.numberLabel}`)}</footer>` +
    `</article>\n`
  );
}
