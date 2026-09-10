import * as cheerio from 'cheerio';
import { extractHtmlLiteral } from './htmlLiteral.js';
import type { FarbrengenListingEntry } from './types.js';

const LOAD_FRAGMENT_CALL = /loadFarbrengenFragment\(event,\s*(\d+),\s*(true|false),\s*'([^']*)'\)/;

/**
 * Parses a `/all/by_year/{year}` (or `.js?include_right_nav=false`) response
 * — or the special combined `/all/by_year/5690_5710` pre-Nesius bucket page,
 * which spans multiple Hebrew years in one response — into one entry per
 * indexed farbrengen/sicha occasion. This is the cheap, high-level crawl
 * step — each entry's `id` is then used to fetch its full breakdown via
 * {@link parseFragmentPage}.
 *
 * `hebrewYear` is always derived from the entry's own `hebrewDate` prefix
 * rather than taken as a parameter: real per-year pages only ever contain
 * that year's entries anyway, but the bucket page mixes years 5690-5710 in
 * a single response, so trusting a single passed-in year would silently
 * mislabel every entry but the first year's.
 */
export function parseListingPage(rawResponse: string): FarbrengenListingEntry[] {
  const html = extractHtmlLiteral(rawResponse);
  const $ = cheerio.load(html);
  const entries: FarbrengenListingEntry[] = [];

  $('div.farbrengen').each((_, el) => {
    const button = $(el).find('> button.farbrengen-button').first();
    const onclick = button.attr('onclick') ?? '';
    const match = onclick.match(LOAD_FRAGMENT_CALL);
    if (!match) return; // Defensive: skip anything not shaped like a farbrengen button rather than throw mid-crawl.

    const labelContainer = button.find('> div').first().clone();
    labelContainer.find('.material-symbols-outlined').remove(); // strips the expand/collapse chevron icon's text
    const occasionLabel = labelContainer.text().trim();
    const hebrewDate = match[3]!;
    const hebrewYear = Number(hebrewDate.split('-')[0]);

    entries.push({
      id: Number(match[1]),
      hebrewYear,
      hebrewDate,
      isPreNesius: match[2] === 'true',
      occasionLabel,
    });
  });

  return entries;
}
