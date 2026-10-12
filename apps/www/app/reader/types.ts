import type { PathLevel as ApiLevel } from '@chassidushub/client';
import type { Pdf } from '../lib/pdfs';

/** A neighbour in the work's order: the sicha before or after this one. */
export interface Neighbour {
  path: string;
  label: string;
}

/** The words a reading page shows, as its loader sends them. */
export type ReaderText =
  | {
      kind: 'words';
      /**
       * The body and the notes as HTML. Null as the server sends them: on a
       * whole page they are drawn on the server only (ui/ServerHtml.tsx); on a
       * click they are fetched from `url` and drawn into the page (reader/click.ts).
       */
      body: string | null;
      notes: string | null;
      /** Where these words are kept for good: their address changes whenever they do (routes/words.ts). */
      url: string;
      hasNotes: boolean;
      /** Words a machine made and nobody checked yet: none, some, or all of them. */
      machine: 'none' | 'some' | 'all';
      version: string;
      versions: { version: string; label: string }[];
      credit?: string;
      source?: string;
    }
  | {
      kind: 'pages';
      first: number;
      last: number;
      /** The scan's page images, when it has them, else the PDF to open. */
      images: { page: number; src: string; width: number; height: number }[];
      pdf: string | null;
    }
  | { kind: 'withheld'; reason: string; source?: string }
  | { kind: 'none' };

export interface ReaderData {
  id: string;
  path: string;
  title: string;
  /** What the unit is, by its own level (`sicha`, `letter`, `chapter`): the last level of its position. Picks its view (views.ts). */
  level?: string;
  /** Under the title: the sefer and the volume ("לקוטי שיחות · חלק י״ב"). */
  sub: string;
  /** The API's path to the page, drawn as the Library draws it (lib/catalog.ts). */
  pathBar: ApiLevel[];
  previous: Neighbour | null;
  next: Neighbour | null;
  text: ReaderText;
  /** The printing's scan where its file is served: the whole PDF, opened at the page's first page. */
  scan: string | null;
  /** The recordings of the farbrengens the page was said at, each heard on its listening page. */
  recordings: { path: string; label: string; duration?: string }[];
  /** The page's PDFs, its own printing first. */
  pdfs: Pdf[];
  /** How the page is cited when its words are copied ("לקוטי שיחות, חלק י״ב, שמיני א"). */
  citation: string;
  url: string;
  /** For Edit: the revision shown, the page's own names, and the sefer it is in (edited on its own page). */
  rev: number;
  names: { he: string; en: string };
  work: { path: string; label: string } | null;
}
