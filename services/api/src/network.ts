import type { Hono } from 'hono';
import { catalogHealth, EMBEDDED_TYPES, relationsOf, searchMoments, searchPage, searchSimilar, searchSuggest, type Catalog, type Embedder } from '@chassidushub/core';
import { isValidDateKey } from '@chassidushub/hebrew';
import { LANGUAGES, readId, type EntityType, type Language } from '@chassidushub/model';
import { HttpError } from './app.js';
import { PUBLIC_SUMMARY } from './platform.js';
import { subjectsFor, type Kept } from './summaries.js';

/**
 * The API's phase-6 reading (the plan, section 9): search that lands on
 * the moment, search by meaning, an item's links both ways, and the
 * health of the catalog. Everything here reads; nothing needs an account.
 */

const whole = (value: string | undefined, name: string, max: number): number | undefined => {
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value)) throw new HttpError(400, `${name} must be a whole number`);
  return Math.min(Number(value), max);
};

export function networkRoutes(app: Hono, catalog: Catalog, options: { embedder?: Embedder | null; kept?: Kept }): void {
  // Lines on scans' pages and paragraphs of texts and transcripts where the words are: where to open, and whether a person has checked it.
  app.get('/v1/search/moments', async (c) => {
    const q = c.req.query('q') ?? '';
    // A year, month or day the words were said in (a date key: 5711, 5711-11, 5711-11-10); the caller takes it out of q.
    const within = c.req.query('within') || null;
    if (within !== null && !isValidDateKey(within)) throw new HttpError(422, 'within must be a date key, like 5711 or 5711-11-10');
    return c.json({ query: q, moments: await searchMoments(catalog, q, { limit: whole(c.req.query('limit'), 'limit', 100), within }) });
  });

  // The new site's search screen, ready to draw, in one read; a date in q puts its words first and alone is that day's farbrengen.
  app.get('/v1/search/page', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const within = c.req.query('within') || null;
    if (within !== null && !isValidDateKey(within)) throw new HttpError(422, 'within must be a date key, like 5711 or 5711-11-10');
    const language = c.req.query('language') || null;
    if (language !== null && !(LANGUAGES as readonly string[]).includes(language)) throw new HttpError(422, `language is one of ${LANGUAGES.join(', ')}`);
    const kept = options.kept;
    return c.json(await searchPage(catalog, q, { within, language: language as Language | null, subjects: kept ? (words) => subjectsFor(kept, words) : undefined }));
  });

  // Names as someone types: up to six, one statement.
  app.get('/v1/search/suggest', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    return c.json({ query: q, hits: await searchSuggest(catalog, q) });
  });

  // Search by meaning: off (available: false) until the embeddings' keys are set. Every result is the machine's guess, and says so.
  app.get('/v1/search/similar', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const embedder = options.embedder ?? null;
    if (!embedder) return c.json({ query: q, available: false, machine: true, results: [] });
    const types = (c.req.query('types') ?? '').split(',').filter(Boolean);
    for (const t of types) if (!EMBEDDED_TYPES.includes(t as EntityType)) throw new HttpError(400, `types are some of ${EMBEDDED_TYPES.join(', ')}`);
    if (!q) return c.json({ query: q, available: true, model: embedder.model, machine: true, results: [] });
    if (q.length > 1000) throw new HttpError(400, 'ask in at most 1,000 characters');
    const results = await searchSimilar(catalog, embedder, q, { limit: whole(c.req.query('limit'), 'limit', 50), types: types.length ? (types as EntityType[]) : undefined });
    return c.json({ query: q, available: true, model: embedder.model, machine: true, results } as Record<string, unknown>);
  });

  // An item's links: what it cites, where it was printed, the farbrengen it is based on, and what cites it.
  app.get('/v1/entities/:id/relations', async (c) => {
    const id = readId(c.req.param('id'));
    if (!id) throw new HttpError(400, `"${c.req.param('id')}" is not an id (rh-…)`);
    return c.json({ relations: await relationsOf(catalog, id) });
  });

  // Coverage per year and set, pages nobody checked, recordings not synced, links that do not answer, suggestions waiting longest.
  app.get('/v1/health', async (c) => c.json((await catalogHealth(catalog, { limit: whole(c.req.query('limit'), 'limit', 500) })) as unknown as Record<string, unknown>, 200, { 'Cache-Control': PUBLIC_SUMMARY }));
}
