/**
 * One address per farbrengen (docs: the UI/UX redo plan, "Structure"):
 * `/f/<year>/<occasion>`, with its PDFs under it. How the page was reached
 * changes only where Back goes, never the address - so a shared link, a
 * search result and the week's list all open the same page.
 *
 * Every older address still works: the four route families a farbrengen
 * used to live under (the week, a year, every year's week, one occasion
 * every year) and their recordings, category and PDF pages all lead to the
 * new one (`canonicalFarbrengenPath`, and its test keeps the list).
 */

export function farbrengenPath(hebrewYear: number, occasionId: number): string {
  return `/f/${hebrewYear}/${occasionId}`;
}

export function farbrengenPdfPath(hebrewYear: number, occasionId: number, driveFileId: string): string {
  return `${farbrengenPath(hebrewYear, occasionId)}/pdf/${encodeURIComponent(driveFileId)}`;
}

/** The farbrengen page's sections, as anchors on its address. */
export const FARBRENGEN_AUDIO_ANCHOR = 'audio';
export const FARBRENGEN_TEXTS_ANCHOR = 'texts';

const OLD_FAMILIES: readonly RegExp[] = [
  /^\/follow\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/browse\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/this-week-all-years\/(\d+)\/(\d+)(\/.*)?$/,
  /^\/occasion-all-years\/\d+\/\d+\/(\d+)\/(\d+)(\/.*)?$/,
];

/** An old farbrengen address's new one, or `null` for an address that is not one. */
export function canonicalFarbrengenPath(pathname: string): string | null {
  for (const family of OLD_FAMILIES) {
    const match = family.exec(pathname);
    if (!match) continue;
    const base = farbrengenPath(Number(match[1]), Number(match[2]));
    const rest = match[3] ?? '';
    if (rest === '' || rest === '/') return base;
    if (rest === '/recordings') return `${base}#${FARBRENGEN_AUDIO_ANCHOR}`;
    if (/^\/category\/[^/]+$/.test(rest)) return `${base}#${FARBRENGEN_TEXTS_ANCHOR}`;
    if (/^\/pdf\/[^/]+$/.test(rest)) return `${base}${rest}`;
    return null;
  }
  return null;
}
