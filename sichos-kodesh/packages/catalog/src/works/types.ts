/**
 * The library as works (catalog schema 3 - docs/chabad-library-plan.md,
 * section 5): the Rebbeim, their seforim, and each sefer's units and
 * editions. Built by packages/works from its registry and the importers'
 * output (packages/sefaria-index), and bundled only by the phone.
 *
 * A work the library already holds as a collection (Likkutei Sichos, the
 * maamorim, ...) names that collection, and its units are the collection's
 * items, by the same ids: nothing is repeated here. A work imported from a
 * text source carries its contents and units in a part of its own, which
 * the phone reads only when that work is opened.
 */

export interface CatalogNames {
  he: string;
  en: string;
}

export interface CatalogAuthor {
  id: string;
  name: CatalogNames;
  /** The Rebbe's place in the line of Chabad Rebbeim, 1 (the Alter Rebbe) to 7. */
  rebbe?: number;
}

/** Whether a copy may leave the machine it was built on (packages/works' rights gate). */
export type CatalogRights = 'ship' | 'ship-with-credit' | 'link-only' | 'local-only';

/** One source's copy of a work. */
export interface CatalogWorkSource {
  /** `sefaria`, `chabadlibrary`, `hebrewbooks`, `mafteiach`, `jem`, `igros-app`. */
  source: string;
  /** The source's own id: a Sefaria title, a chabadlibrary.org tree id. */
  sourceId: string;
  kind: 'text' | 'scan' | 'pdf' | 'audio' | 'video';
  language?: 'he' | 'en' | 'yi';
  licence: string;
  rights: CatalogRights;
  credit?: string;
  version?: string;
}

export interface CatalogWork {
  id: string;
  title: CatalogNames;
  authors: string[];
  genre: string;
  /** Its structure, outermost first: `['part', 'chapter']`. */
  levels: string[];
  /** The library collection that holds its units (schema 2), when it has one. */
  collection?: string;
  sources: CatalogWorkSource[];
  /** An imported work: how many units its contents part has. */
  units?: number;
  /** An imported work: the bytes of every text it may ship, for "download this sefer". */
  textBytes?: number;
}

/** One source's copy of one unit: an index into its work's `sources`, and its text object when it ships. */
export interface CatalogEdition {
  source: number;
  sha256?: string;
  bytes?: number;
}

export interface CatalogUnit {
  /** Unique within its work: its path, `part1/32`. */
  id: string;
  label: string;
  labelEn?: string;
  /** The source's reference for the unit (a Sefaria ref), shared by its editions. */
  ref?: string;
  editions: CatalogEdition[];
}

export type CatalogContentsEntry = { unitId: string } | CatalogContentsNode;

/** A work's table of contents, in its own order. */
export interface CatalogContentsNode {
  title: CatalogNames;
  entries: CatalogContentsEntry[];
}

/** An imported work's contents and units: one part per work. */
export interface CatalogWorkContents {
  workId: string;
  contents: CatalogContentsEntry[];
  units: CatalogUnit[];
}

/** What the phone always has: every author and work, without their units. */
export interface CatalogWorksIndex {
  authors: CatalogAuthor[];
  works: CatalogWork[];
}

/** The whole of it, as a schema-3 release carries it. */
export interface CatalogWorks extends CatalogWorksIndex {
  contents: Record<string, CatalogWorkContents>;
}
