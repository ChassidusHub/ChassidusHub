import { pickView, type ReaderView } from './view';
import type { ReaderData } from './types';

/**
 * Every view in app/views, found by its file: a new kind needs no line here
 * (docs/rfc/0004-view-kinds.md). Read once, when the reader's code loads, so
 * a page picks its view with no wait. A file whose `kind` is not its own name
 * is a mistake caught here and in tests/views.test.ts.
 */
const found = import.meta.glob<ReaderView>('../views/*.tsx', {
  eager: true,
  import: 'view',
});

export const VIEWS: readonly ReaderView[] = Object.entries(found).map(([file, view]) => {
  const name = file.slice(file.lastIndexOf('/') + 1, -'.tsx'.length);
  if (view?.kind !== name) throw new Error(`app/views/${name}.tsx must export a view of kind "${name}"`);
  return view;
});

/**
 * The view a reading page is drawn with (view.ts, `pickView`). Until the API
 * says which view a sefer names (RFC 0004, step 3), it is picked by the unit's own level.
 */
export const viewFor = (data: Pick<ReaderData, 'level'> & { view?: string }): ReaderView => pickView(VIEWS, data);
