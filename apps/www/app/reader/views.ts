import { pickView, type ReaderView } from './view';
import type { ReaderData } from './types';

/**
 * Every view in app/views, found by its file: a new kind needs no line here
 * (docs/rfc/0004-view-kinds.md). Read once, when the reader's code loads, so
 * a page picks its view with no wait. Each file's `kind` is its own name
 * (tests/views.test.ts).
 */
export const VIEWS: readonly ReaderView[] = Object.values(import.meta.glob<ReaderView>('../views/*.tsx', { eager: true, import: 'view' }));

/**
 * The view a reading page is drawn with (view.ts, `pickView`): the one its
 * data names (load.server.ts), else by the unit's own level.
 */
export const viewFor = (data: Pick<ReaderData, 'level' | 'view'>): ReaderView => pickView(VIEWS, data);
