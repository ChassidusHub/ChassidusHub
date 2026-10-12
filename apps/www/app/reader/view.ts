import type { ComponentType } from 'react';
import type { ReaderData } from './types';

/** The words of a page that has them, as a view draws them. */
export type ReaderWords = Extract<ReaderData['text'], { kind: 'words' }>;

/**
 * How the reader shows one kind of sefer (docs/rfc/0004-view-kinds.md): a
 * sicha, a letter, a farbrengen, an index, a day of Hayom Yom. The reading
 * page around it is the same for every kind (the path bar, the title, the
 * corner menu, fixing, the footnote sheet, the sicha before and after); a
 * view draws only what differs: the facts under the title and the words.
 *
 * A new kind is one file, app/views/<kind>.tsx, exporting `view`; the
 * registry (views.ts) finds it with no other change.
 */
export interface ReaderView {
  /** The kind's name, as the sefer's `view` names it in the catalog: `sichos`, `letters`. The same as its file's name. */
  kind: string;
  /**
   * The units' own levels this view is for when their sefer names no view
   * (`letter` for letters): the last level of a unit's position, as the
   * catalog snapshot's names give a unit's kind.
   */
  levels?: readonly string[];
  /** Under the title: the facts this kind shows (a letter's number, date and addressee). */
  Head?: ComponentType<{ data: ReaderData }>;
  /** The words and their footnotes; a view that changes only the facts above them uses the sichos view's (`SichaWords`). */
  Words: ComponentType<{ data: ReaderData; words: ReaderWords }>;
}

/** The kind every page falls back to: a sicha's words and footnotes. */
export const DEFAULT_VIEW = 'sichos';

/**
 * The view a page is drawn with: the one its sefer names, else the one for
 * its unit's own level, else the sichos view. A kind with no view yet (the
 * catalog may name one before its view is built) falls through the same way,
 * so a page always has a view.
 */
export function pickView(views: readonly ReaderView[], page: { view?: string; level?: string }): ReaderView {
  return (page.view && views.find((view) => view.kind === page.view)) || (page.level && views.find((view) => view.levels?.includes(page.level!))) || views.find((view) => view.kind === DEFAULT_VIEW)!;
}
