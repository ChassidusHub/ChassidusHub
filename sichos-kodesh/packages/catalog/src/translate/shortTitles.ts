import type { CatalogLibrary, LibraryItemBase } from '../library/types.js';
import type { CatalogEntry } from '../types.js';

/**
 * Short forms of the long occasion names, for titles: a row, a screen's
 * header, the player (translations/short-titles.json, written once and
 * checked, read by bin/libraryTranslations.ts). Keyed by the long name as
 * the catalog has it - mafteiach's Hebrew (`he`), or its English
 * translation (`en`). A name short enough already has no entry.
 */
export interface ShortTitles {
  he: Readonly<Record<string, string>>;
  en: Readonly<Record<string, string>>;
}

function shortFields(long: string | undefined, longEn: string | undefined, table: ShortTitles, key: string, keyEn: string): Record<string, string> {
  const out: Record<string, string> = {};
  const short = long ? table.he[long] : undefined;
  const shortEn = longEn ? table.en[longEn] : undefined;
  if (short) out[key] = short;
  if (shortEn) out[keyEn] = shortEn;
  return out;
}

/**
 * Each farbrengen with its short title beside the long one
 * (`occasionLabelShort`, `occasionLabelShortEn`). The long name stays what
 * it is - the apps key saved progress by it and show it as the
 * description. A copy is returned.
 */
export function shortenCatalogYear(entries: CatalogEntry[], table: ShortTitles): CatalogEntry[] {
  // Beside the long names, in the year file's own order.
  return entries.map(({ occasionId, hebrewYear, hebrewDate, occasionLabel, occasionLabelEn, audio, pdfs }) => ({
    occasionId,
    hebrewYear,
    hebrewDate,
    occasionLabel,
    ...(occasionLabelEn !== undefined && { occasionLabelEn }),
    ...shortFields(occasionLabel, occasionLabelEn, table, 'occasionLabelShort', 'occasionLabelShortEn'),
    audio,
    pdfs,
  }));
}

/**
 * The library with the short titles beside the long names: where a maamar
 * was said (`occasionLabelShort`, `occasionLabelShortEn`) and the names of
 * the reshimos, the letters and the hadranim (`labelShort`, `labelShortEn`).
 * A copy is returned.
 */
export function shortenLibrary(library: CatalogLibrary, table: ShortTitles): CatalogLibrary {
  const labels = <T extends LibraryItemBase>(items: T[]): T[] =>
    items.map((item) => {
      const rest = { ...item };
      delete rest.labelShort;
      delete rest.labelShortEn;
      return { ...rest, ...shortFields(item.label, item.labelEn, table, 'labelShort', 'labelShortEn') };
    });
  const { maamorim, reshimos, michtavimKlolim, hadranim } = library.collections;
  return {
    ...library,
    collections: {
      ...library.collections,
      maamorim: {
        ...maamorim,
        items: maamorim.items.map((item) => {
          const rest = { ...item };
          delete rest.occasionLabelShort;
          delete rest.occasionLabelShortEn;
          return { ...rest, ...shortFields(item.occasionLabel, item.occasionLabelEn, table, 'occasionLabelShort', 'occasionLabelShortEn') };
        }),
      },
      reshimos: { ...reshimos, items: labels(reshimos.items) },
      michtavimKlolim: { ...michtavimKlolim, items: labels(michtavimKlolim.items) },
      hadranim: { ...hadranim, items: labels(hadranim.items) },
    },
  };
}
