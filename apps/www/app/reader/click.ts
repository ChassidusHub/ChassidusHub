import type { ReaderData } from './types';
import type { DrawnWords } from './words.server';

/**
 * The item page's click (routes/item.tsx clientLoader), loaded on the first
 * click, never with the page. A shelf, a sefer or a volume is drawn from the
 * catalog snapshot (catalog/clicks.ts).
 *
 * A sicha's page data comes without its words, and the page is handed over at
 * once. Its words follow from their own address, kept for good by the browser
 * and the service worker (public/sw.js), so a sicha read once opens again with
 * none of its words over the network. They are drawn straight into the page's
 * body and notes, which hold HTML React never draws itself (ui/ServerHtml.tsx),
 * so the reader's own script, on every first visit, stays as it was.
 *
 * With no network, a page whose click data or words were never kept is
 * opened whole, from what the worker kept.
 */
export async function sichaClick<T>(request: Request, serverLoader: () => Promise<T>) {
  const whole = () => {
    window.location.assign(request.url);
    return new Promise<never>(() => {});
  };
  const { itemClick } = await import('../catalog/clicks');
  const loaded = await itemClick(request, () => serverLoader().catch((error: unknown) => (error instanceof TypeError ? whole() : Promise.reject(error))));
  const reader = (loaded as { reader?: ReaderData }).reader;
  if (reader?.text.kind === 'words' && reader.text.body === null) void keptWords(reader.text.url).then((words) => drawInto(reader.path, words), whole);
  return loaded;
}

/** A page's drawn words from their own address (routes/words.ts): never out of date, as the address changes with the words. */
async function keptWords(url: string): Promise<DrawnWords> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the words could not be read (${response.status})`);
  return (await response.json()) as DrawnWords;
}

/** Draws the words into the page at `path` once it is on screen; if another page is shown by then, there is nothing to do. */
async function drawInto(path: string, words: DrawnWords) {
  for (let frame = 0; frame < 120; frame++) {
    const body = document.querySelector(`[data-html="${CSS.escape(`body:${path}`)}"]`);
    if (body) {
      body.innerHTML = words.body;
      const notes = document.querySelector(`[data-html="${CSS.escape(`notes:${path}`)}"]`);
      if (notes) notes.innerHTML = words.notes;
      return;
    }
    await new Promise((next) => requestAnimationFrame(next));
  }
}
