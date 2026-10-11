/**
 * Junk that a source's names carry into the catalog (#125): a folder's
 * number in front ("יד.1. Sichos Mugeh in English", "12. בראשית") and
 * contact details someone wrote into a file name ("Tanya with nikud -
 * 347-426-8187"). The catalog's rule is no folder numbers in names, and a
 * phone number or an address does not belong in a public title. Importers
 * drop them (the source's own record still has the name as it was), and
 * the catalog's health lists the names that still carry them, for people
 * to fix as suggestions.
 *
 * The patterns are written so JavaScript and Postgres read them alike.
 */

/** A folder number in front: digits or Hebrew letters, each followed by a dot or a bracket ("יד.1. ", "3) ", "א. "). */
export const FOLDER_NUMBER_PATTERN = '^\\s*(?:[0-9]{1,3}|[א-ת]{1,3})[.)](?:[0-9]{1,3}[.)])*\\s+';

/** A phone number: ten digits in groups (347-426-8187, (347) 426 8187), or an international one (+972 …). */
export const PHONE_PATTERN = '(?:\\(?[0-9]{3}\\)?[-. ][0-9]{3}[-. ][0-9]{4}|\\+[0-9][0-9 -]{7,}[0-9])';

/** An email address. */
export const EMAIL_PATTERN = '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}';

export type NameJunk = 'folder-number' | 'phone' | 'email';

/** What junk a name carries, if any. */
export function nameJunk(name: string): NameJunk[] {
  const found: NameJunk[] = [];
  if (new RegExp(FOLDER_NUMBER_PATTERN).test(name)) found.push('folder-number');
  if (new RegExp(PHONE_PATTERN).test(name)) found.push('phone');
  if (new RegExp(EMAIL_PATTERN).test(name)) found.push('email');
  return found;
}

/**
 * The name without its junk: the folder number in front, and contact
 * details with the dash or comma before them. A name that is nothing but
 * junk is left as it was, so nothing is named by nothing.
 */
export function cleanName(name: string): string {
  const contact = new RegExp(`\\s*[-–—,:|]?\\s*(?:${PHONE_PATTERN}|${EMAIL_PATTERN})`, 'g');
  const cleaned = name.replace(new RegExp(FOLDER_NUMBER_PATTERN), '').replace(contact, '').replace(/\s+/g, ' ').trim();
  return cleaned || name.trim();
}
