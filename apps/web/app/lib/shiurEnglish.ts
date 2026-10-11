/**
 * The day's shiurim named in English, for the English page (#122): the API
 * names them as the Hebrew calendars print them (`נח, ראשון עם פירש״י`,
 * `הלכות גזילה ואבידה פרקים ד-ו`), but each also carries Sefaria's English
 * reference, which says the same thing to someone who reads only English.
 * Anything that does not read as expected gives null, and the Hebrew stays.
 */

const dash = (s: string) => s.replace(/(\d)-(\d)/g, '$1–$2');

/** `Genesis 6:9-22` → `Genesis 6:9–22, with Rashi`. */
export function chumashEnglish(ref: string | null | undefined): string | null {
  return ref ? `${dash(ref)}, with Rashi` : null;
}

/** `Psalms 145-150` (one or more) → `Psalms 145–150`. */
export function tehillimEnglish(refs: Array<string | null | undefined>): string | null {
  const all = refs.filter((r): r is string => Boolean(r));
  return all.length ? all.map(dash).join(', ') : null;
}

/**
 * The Rambam's chapters by their English section names:
 * `Mishneh Torah, Robbery and Lost Property 4` … `6` → `Robbery and Lost Property, chapters 4–6`;
 * `Sefer HaMitzvot, Negative Commandments 247` → `Negative commandment 247`.
 */
export function rambamEnglish(refs: string[]): string | null {
  const parts: Array<{ book: string; n: number[] }> = [];
  for (const ref of refs) {
    const m = /^(?:Mishneh Torah, )?(.+?) (\d+)$/.exec(ref.trim());
    if (!m) return null;
    const [, book, n] = m as unknown as [string, string, string];
    const last = parts[parts.length - 1];
    if (last?.book === book) last.n.push(Number(n));
    else parts.push({ book, n: [Number(n)] });
  }
  if (!parts.length) return null;
  return parts
    .map(({ book, n }) => {
      const mitzvos = /^Sefer HaMitzvot, (Positive|Negative) Commandments$/.exec(book);
      if (mitzvos) return `${mitzvos[1]} commandment${n.length > 1 ? 's' : ''} ${n.join(', ')}`;
      const span = n.length > 1 && n[n.length - 1]! - n[0]! === n.length - 1 ? `${n[0]}–${n[n.length - 1]}` : n.join(', ');
      return `${book}, chapter${n.length > 1 ? 's' : ''} ${span}`;
    })
    .join('; ');
}
