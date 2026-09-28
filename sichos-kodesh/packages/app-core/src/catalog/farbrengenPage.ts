import { HDate } from '@hebcal/core';
import type { CatalogByYear, CatalogEntry, CatalogPdf, PdfEdition, PdfSection } from '@sichos-kodesh/catalog';
import { PDF_SECTION_ORDER, entryHasContent, isHighlightedFarbrengenHanacha, mafteiachDay, mafteiachMonthToken, mafteiachMonthTokenToHDateMonth, sortPdfsByEditionPreference } from '@sichos-kodesh/catalog';
import type { Language } from '../search/language.js';

/**
 * A farbrengen's one page (docs: the UI/UX redo plan, "A farbrengen"): what
 * it holds, in the order the page shows it, so the phone and the web lay
 * out the same page from the same answers. Pure, and tested.
 */

export interface FarbrengenTextGroup {
  section: PdfSection;
  pdfs: CatalogPdf[];
}

export interface FarbrengenTexts {
  /** Its own hanachos (Toras Menachem, Sichos Kodesh): the preferred edition first, the other right under it - never hidden. */
  hanachos: CatalogPdf[];
  /** Everything else by section, in mafteiach's order: mugah, a biltiMugah citing some other source, maamorim, hagahos, hosafos. */
  groups: FarbrengenTextGroup[];
}

export function farbrengenTexts(entry: CatalogEntry, preference: PdfEdition | null = null): FarbrengenTexts {
  const hanachos = sortPdfsByEditionPreference(entry.pdfs.filter(isHighlightedFarbrengenHanacha), preference);
  const rest = entry.pdfs.filter((pdf) => !isHighlightedFarbrengenHanacha(pdf));
  const groups = PDF_SECTION_ORDER.map((section) => ({ section, pdfs: rest.filter((pdf) => pdf.section === section) })).filter((group) => group.pdfs.length > 0);
  return { hanachos, groups };
}

/** The one edition to show first, from the editions the listener keeps: one chosen is a preference, both (or none) is none. */
export function preferredHanachaEdition(kept: readonly PdfEdition[]): PdfEdition | null {
  return kept.length === 1 ? kept[0]! : null;
}

export interface OccasionMarks {
  /** Every chapter's length together, 0 when there is no recording. */
  durationMs: number;
  chapters: number;
  hanacha: boolean;
  mugah: boolean;
}

/** What a farbrengen has, at a glance: shown the same way wherever it is listed. */
export function occasionMarks(entry: CatalogEntry): OccasionMarks {
  return {
    durationMs: entry.audio.reduce((sum, chapter) => sum + (chapter.durationMs || 0), 0),
    chapters: entry.audio.length,
    hanacha: entry.pdfs.some(isHighlightedFarbrengenHanacha),
    mugah: entry.pdfs.some((pdf) => pdf.section === 'mugah'),
  };
}

export interface OccasionNeighbors {
  previous: CatalogEntry | null;
  next: CatalogEntry | null;
}

/** The farbrengens right before and after one, in the catalog's order - within its year, then across into the years around it; only ones with something to open. */
export function neighborOccasions(catalog: CatalogByYear, hebrewYear: number, occasionId: number): OccasionNeighbors {
  const withContent = (year: number) => (catalog[year] ?? []).filter(entryHasContent);
  const list = withContent(hebrewYear);
  const index = list.findIndex((entry) => entry.occasionId === occasionId);
  if (index < 0) return { previous: null, next: null };
  const years = Object.keys(catalog)
    .map(Number)
    .sort((a, b) => a - b);
  const at = years.indexOf(hebrewYear);
  let previous = list[index - 1] ?? null;
  for (let k = at - 1; !previous && k >= 0; k--) {
    const earlier = withContent(years[k]!);
    previous = earlier[earlier.length - 1] ?? null;
  }
  let next = list[index + 1] ?? null;
  for (let k = at + 1; !next && k < years.length; k++) next = withContent(years[k]!)[0] ?? null;
  return { previous, next };
}

const WEEKDAYS: Record<Language, readonly string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'],
  he: ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת קודש'],
};

/** The day of the week an occasion fell on ("Shabbos", "יום שני"), or `null` for a date the catalog does not give to the day. */
export function occasionWeekday(hebrewDate: string, language: Language): string | null {
  if (!/^\d{4}-\d{2}[AB]?-\d{2}/.test(hebrewDate)) return null;
  const year = Number(hebrewDate.slice(0, 4));
  const day = mafteiachDay(hebrewDate);
  if (!(day > 0)) return null;
  try {
    return WEEKDAYS[language][new HDate(day, mafteiachMonthTokenToHDateMonth(mafteiachMonthToken(hebrewDate)), year).getDay()] ?? null;
  } catch {
    return null;
  }
}
