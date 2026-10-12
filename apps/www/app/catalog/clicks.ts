import { libraryPage, pathOf } from '../library/page';
import { loadLibrary, loadOtherShelves } from '../library/load';
import { browserSnapshot, drawn, warmUnits } from './browser';
import { rebbeOnTop } from './localApi';
import { isNotLocal } from './snapshot';
// Already loaded with any library page: importing it keeps the helpers the screens share with these reads
// (lib/catalog.ts) in the screens' file, rather than splitting them into a file of their own on a first visit.
import '../library/screens';

/**
 * The library routes' clientLoaders (listening's are app/listen/clicks.ts):
 * a click to the library, a shelf, a sefer or a volume drawn in the browser from the catalog snapshot it keeps
 * (app/catalog/browser.ts), with no server round trip, by the same code the
 * server draws them with. Anything the snapshot cannot answer, or a click
 * before it is at hand, is asked of the server as before (`serverLoader`).
 *
 * This file and what it reads are loaded on the first click, never with the
 * page, so they cost a first visit's script nothing; each route keeps only a
 * line that imports it.
 */

/** An item's page (routes/item.tsx): only a shelf, a sefer or a volume is drawn here; a scan's printings are read by the page itself. */
export const itemClick = <T>(request: Request, serverLoader: () => Promise<T>) =>
  drawn(serverLoader, async (api) => {
    const url = new URL(request.url);
    const page = await libraryPage(api, url).catch(async (error: unknown) => (isNotLocal(error) && (await onTop(url))) || Promise.reject(error));
    if (page.screen === 'work') warmUnits(page.id);
    return page.screen === 'view' ? serverLoader() : page;
  });

/** The library, or its other shelves (`?more`). */
export const libraryClick = <T>(request: Request, serverLoader: () => Promise<T>) =>
  drawn(serverLoader, async (api) =>
    new URL(request.url).searchParams.has('more') ? { screen: 'more' as const, others: Promise.resolve(await loadOtherShelves(api)) } : { screen: 'library' as const, ...(await loadLibrary(api)) },
  );

/** A Rebbe's page from the top file alone (#301), while his shelf's file has not come; null for any other page. */
async function onTop(url: URL) {
  const core = await browserSnapshot().core();
  return url.search || !core ? null : rebbeOnTop(core, pathOf(url));
}
