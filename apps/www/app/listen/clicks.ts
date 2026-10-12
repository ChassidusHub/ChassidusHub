import { drawn } from '../catalog/browser';
import { yearPage } from './events';

/**
 * A click to a year of listening, drawn in the browser from the catalog
 * snapshot it keeps (app/catalog/browser.ts), with no server round trip, by
 * the same code the server draws it with; else asked of the server. Loaded
 * on the first click, never with the page.
 */
export const yearClick = <T>(year: string | undefined, serverLoader: () => Promise<T>) => drawn(serverLoader, (api) => yearPage(api, Number(year)));
