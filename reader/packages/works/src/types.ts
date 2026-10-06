import type { LibraryCollectionId } from '@chassidushub-reader/catalog';

/**
 * The library as works (docs/chabad-library-plan.md, section 5): a sefer or
 * a series by an author, split into units a person reads or hears, each
 * unit with editions from different sources. The seven collections the
 * phone already browses (catalog schema 2) are works too, and their item
 * ids are the units' ids, so downloads, progress and packs made so far keep
 * working.
 */

export interface Names {
  he: string;
  en: string;
}

export interface Author {
  /** Stable, lower-case: `alter-rebbe`, `the-rebbe`. */
  id: string;
  name: Names;
  /** The Rebbe's place in the line of Chabad Rebbeim, 1 (the Alter Rebbe) to 7. */
  rebbe?: number;
}

export type Genre = 'chassidus' | 'maamarim' | 'sichos' | 'igros' | 'halacha' | 'siddur' | 'minhagim' | 'history' | 'diaries' | 'recordings';

/** Where a copy comes from. */
export type SourceId = 'mafteiach' | 'jem' | 'chabadlibrary' | 'sefaria' | 'hebrewbooks' | 'igros-app';

/**
 * What its source lets us do with a copy, as the source states it.
 * `facts-and-links`: an index of dates, names and links to files hosted
 * elsewhere (mafteiach.app, JEM) - what the apps ship today.
 */
export type Licence = 'facts-and-links' | 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-nc' | 'free-to-read' | 'site-terms' | 'commercial' | 'unknown';

export type EditionKind = 'text' | 'scan' | 'pdf' | 'audio' | 'video';

/** One source's copy of a work. */
export interface WorkSource {
  source: SourceId;
  /** The source's own id: a chabadlibrary.org tree id, a Sefaria title. */
  sourceId: string;
  kind: EditionKind;
  language?: 'he' | 'en' | 'yi';
  licence: Licence;
  /** Who is credited when the licence asks for it. */
  credit?: string;
  /** What the copy is, when a source has several (Sefaria's version title). */
  version?: string;
}

export interface Work {
  /** Stable: `tanya`, `likkutei-sichos`. */
  id: string;
  title: Names;
  /** Author ids; empty for a collection of many hands. */
  authors: string[];
  genre: Genre;
  /** Its structure, outermost first: `['volume', 'sicha']`. */
  levels: string[];
  /** The library collection that already holds it on the phone (schema 2). */
  collection?: LibraryCollectionId | 'igros' | 'maanos';
  sources: WorkSource[];
}

/** A text object: one edition's text of one unit, stored by the sha256 of its bytes. */
export interface TextObjectRef {
  sha256: string;
  bytes: number;
}

/** One source's copy of one unit. */
export interface Edition {
  source: SourceId;
  /** The source's own id: a mafteiach/JEM file id, a Sefaria ref. */
  sourceId: string;
  kind: EditionKind;
  licence: Licence;
  role?: string;
  label?: string;
  language?: 'he' | 'en' | 'yi';
  /** Which of the source's versions it is (Sefaria's version title). */
  version?: string;
  /** Who is credited when the licence asks for it. */
  credit?: string;
  /**
   * The text itself, when it was imported and its rights let it leave the
   * machine. A link-only edition has none: the reader opens the source.
   */
  text?: TextObjectRef;
}

/** What a person reads or hears: a letter, a maamar, a sicha, a chapter. */
export interface Unit {
  /** Unique within its work; for a library collection, the item's own id. */
  id: string;
  workId: string;
  /** In Hebrew, its place in the work without the work's title: `ליקוטי אמרים, פרק א׳`. */
  label: string;
  labelEn?: string;
  hebrewYear?: number;
  hebrewDate?: string;
  /** The farbrengen(s) it belongs to (mafteiach occasion ids). */
  occasionIds?: number[];
  editions: Edition[];
}

/** Whether a copy may leave the machine it was built on. */
export type RightsDecision = 'ship' | 'ship-with-credit' | 'link-only' | 'local-only';

/**
 * A work's table of contents: its parts, down to its units, in the work's
 * own order. A part can hold units and smaller parts side by side (Tanya's
 * first part: the title page, the approbations, the foreword, then 53
 * chapters), so the entries are one ordered list.
 */
export interface ContentsNode {
  title: Names;
  entries: ContentsEntry[];
}

export type ContentsEntry = { unitId: string } | ContentsNode;

/** What an importer (Sefaria, chabadlibrary.org) produces for one work. */
export interface ImportedWork {
  workId: string;
  source: SourceId;
  contents: ContentsEntry[];
  units: Unit[];
}
