/**
 * The parts of Sefaria's API answers the importer reads. Sefaria documents
 * them at developers.sefaria.org; only the fields used here are typed, and
 * everything is optional because the answers vary by text.
 */

export interface SefariaTitle {
  text: string;
  lang: string;
  primary?: boolean;
}

/** A node of an index's schema (`api/v2/index/<title>`). */
export interface SefariaNode {
  nodeType?: string | null;
  key?: string;
  /** The primary English title. `api/v2/index` fills these in, shared titles included. */
  title?: string;
  heTitle?: string;
  titles?: SefariaTitle[];
  /** A title taken from Sefaria's shared terms (a parsha, a prayer) when the node has none of its own. */
  sharedTitle?: string;
  /** The node that carries its parent's own text: its ref is the parent's. */
  default?: boolean;
  depth?: number;
  sectionNames?: string[];
  heSectionNames?: string[];
  addressTypes?: string[];
  /** With `with_content_counts=1`: how many segments each section holds, nested like the text. */
  content_counts?: unknown;
  nodes?: SefariaNode[];
}

export interface SefariaIndex {
  title: string;
  heTitle?: string;
  schema: SefariaNode;
}

/** One version in an `api/v3/texts/<ref>` answer. */
export interface SefariaVersionText {
  versionTitle?: string;
  language?: string;
  actualLanguage?: string;
  license?: string;
  /** A string or nested arrays of strings, as deep as the ref leaves open. */
  text?: unknown;
}

export interface SefariaTextResponse {
  ref?: string;
  heRef?: string;
  versions?: SefariaVersionText[];
  warnings?: unknown;
  error?: string;
}
