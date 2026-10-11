import type { PathStep } from '../path';

/** A neighbour in the work's order: the sicha before or after this one. */
export interface Neighbour {
  path: string;
  label: string;
}

/** The words a reading page shows, as its loader sends them. */
export type ReaderText =
  | {
      kind: 'words';
      /** The body and the notes as HTML, or null on a whole page: then they are drawn on the server only (Words.tsx). */
      body: string | null;
      notes: string | null;
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
  /** Under the title: the sefer and the volume ("לקוטי שיחות · חלק י״ב"). */
  sub: string;
  pathBar: PathStep[];
  previous: Neighbour | null;
  next: Neighbour | null;
  text: ReaderText;
  /** How the page is cited when its words are copied ("לקוטי שיחות, חלק י״ב, שמיני א"). */
  citation: string;
  url: string;
}
