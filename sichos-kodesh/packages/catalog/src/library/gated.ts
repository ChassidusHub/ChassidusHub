import { gematriya } from '@hebcal/core';
import type { LibraryCollection, LibraryGroup, LibraryItemBase } from './types.js';

/**
 * The Igros and Maanos as library collections - the same item shape as the
 * rest of the library, with one `text` ref each (the letter's text object in
 * the archive). They are gated (src/rights.ts): `build-catalog --igros`
 * writes them to their own folder for local use, never into `library/`,
 * and a release refuses them. Built from packages/igros-index's output;
 * the input shapes are restated here so the catalog does not depend on it.
 */

export interface IgrosItem extends LibraryItemBase {
  volume: number;
  number: number;
  /** '' or the supplement letter (`קמא*` is 141a). */
  suffix: string;
  /** The letter's number as printed. */
  numberLabel: string;
  /** The page in the printed volume, when known. */
  bookPage?: string;
  dateLine: string;
  city?: string;
  /** The source's one-line summary. */
  summary?: string;
}

export interface MaanehItem extends LibraryItemBase {
  number: number;
  numberLabel: string;
  dateLine: string;
}

export interface GatedLibrary {
  igros: LibraryCollection<IgrosItem>;
  maanos: LibraryCollection<MaanehItem>;
}

/** What packages/igros-index's `IgrosLetter` carries that the item needs. */
export interface IgrosLetterInput {
  id: string;
  number: number;
  suffix: string;
  numberLabel: string;
  volume: number;
  bookPage: string | null;
  dateLine: string;
  hebrewYear: number | null;
  city: string;
  summary: string;
}

/** What packages/igros-index's `Maaneh` carries that the item needs. */
export interface MaanehInput {
  id: string;
  year: number;
  number: number;
  numberLabel: string;
  dateLine: string;
}

function groupsBy<T extends LibraryItemBase>(items: T[], keyOf: (item: T) => number | undefined, nameOf: (key: number) => string): LibraryGroup[] {
  const byKey = new Map<number, string[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined) continue;
    const ids = byKey.get(key) ?? [];
    ids.push(item.id);
    byKey.set(key, ids);
  }
  return [...byKey.keys()].sort((a, b) => a - b).map((key) => ({ slug: String(key), name: nameOf(key), itemIds: byKey.get(key)! }));
}

export function buildGatedLibrary(letters: readonly IgrosLetterInput[], maanos: readonly MaanehInput[]): GatedLibrary {
  const igrosItems = letters.map((letter) => {
    const item: IgrosItem = {
      id: letter.id,
      label: letter.dateLine ? `${letter.numberLabel} - ${letter.dateLine}` : letter.numberLabel,
      volume: letter.volume,
      number: letter.number,
      suffix: letter.suffix,
      numberLabel: letter.numberLabel,
      dateLine: letter.dateLine,
      refs: [{ kind: 'text', sourceId: letter.id }],
    };
    if (letter.hebrewYear !== null) item.hebrewYear = letter.hebrewYear;
    if (letter.bookPage) item.bookPage = letter.bookPage;
    if (letter.city) item.city = letter.city;
    if (letter.summary) item.summary = letter.summary;
    return item;
  });
  const maanosItems = maanos.map((maaneh) => ({
    id: maaneh.id,
    label: maaneh.dateLine ? `${maaneh.numberLabel} - ${maaneh.dateLine}` : maaneh.numberLabel,
    hebrewYear: maaneh.year,
    number: maaneh.number,
    numberLabel: maaneh.numberLabel,
    dateLine: maaneh.dateLine,
    refs: [{ kind: 'text' as const, sourceId: maaneh.id }],
  }));
  return {
    igros: {
      items: igrosItems,
      groups: {
        volume: groupsBy(igrosItems, (item) => item.volume, (volume) => `חלק ${gematriya(volume)}`),
        year: groupsBy(igrosItems, (item) => item.hebrewYear, (year) => gematriya(year)),
      },
    },
    maanos: { items: maanosItems, groups: { year: groupsBy(maanosItems, (item) => item.hebrewYear, (year) => gematriya(year)) } },
  };
}
