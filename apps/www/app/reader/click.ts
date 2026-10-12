import { itemClick } from '../catalog/clicks';
import { keptWords } from './words';
import type { DrawnWords } from './words.server';

/**
 * The item page's click (routes/item.tsx clientLoader), loaded on the first
 * click, never with the page. A shelf, a sefer or a volume is drawn from the
 * catalog snapshot (catalog/clicks.ts). A sicha's page data comes without its
 * words: the page shows at once, and the words come into it from their own
 * address (`coming`), kept for good by the browser and the service worker
 * (public/sw.js), so a sicha read once opens again with none of its words over
 * the network. With no network, a page whose click data or words were never
 * kept is opened whole, from what the worker kept.
 */
export async function sichaClick<T>(request: Request, serverLoader: () => Promise<T>) {
  const whole = () => {
    window.location.assign(request.url);
    return new Promise<never>(() => {});
  };
  const loaded = await itemClick(request, () => serverLoader().catch((error: unknown) => (error instanceof TypeError ? whole() : Promise.reject(error))));
  const text = (loaded as { screen?: string; reader?: { text: { kind: string; body: string | null; url?: string } } }).reader?.text;
  if (!text || text.kind !== 'words' || text.body !== null || !text.url) return loaded;
  const coming: Promise<DrawnWords> = keptWords(text.url).catch(whole);
  return { ...loaded, coming };
}
