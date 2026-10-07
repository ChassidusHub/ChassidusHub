import type { Context, Hono } from 'hono';
import { addTranslation, fixTranslation, forgetDraft, forgetPlace, getDraft, listDrafts, listPlaces, saveDraft, savePlace, sendDraft, type Catalog, type PlaceKind } from '@chassidushub/core';
import { readId, type EntityId } from '@chassidushub/model';

/**
 * A reader's own things: where they stopped reading and listening
 * (packages/core/src/places.ts), and translations of a unit, added and
 * fixed as Suggestions (packages/core/src/translations.ts).
 *
 *   GET    /v1/places?kind=&key=&limit=     where the signed-in person stopped lately
 *   PUT    /v1/places                       keeps a place { kind, key, title, sub, href, place }
 *   DELETE /v1/places?kind=&key=            forgets one
 *   POST   /v1/units/<id>/translations      { language, credit, licence?, translationOf?, content, machine? }
 *   POST   /v1/translations/fix             { segment, content }
 *
 * And their drafts (packages/core/src/drafts.ts): the changes made on a page
 * in Edit and not sent yet, kept per page so they follow the person.
 *
 *   GET    /v1/drafts                       the signed-in person's drafts, the latest first
 *   GET    /v1/drafts/<page id>             one page's draft
 *   PUT    /v1/drafts/<page id>             keeps it { title?, ops }; an empty list forgets it
 *   DELETE /v1/drafts/<page id>             forgets it
 *   POST   /v1/drafts/<page id>/send        sends it as one Suggestion { title?, note? }
 */

type Fail = (status: 400 | 401, message: string) => never;

export function readingRoutes(app: Hono, catalog: Catalog, signedIn: (c: Context) => Promise<string>, fail: Fail): void {
  const json = async <T>(c: Context): Promise<T> => {
    try {
      return (await c.req.json()) as T;
    } catch {
      return fail(400, 'the request body must be JSON');
    }
  };
  const kindOf = (value: string | undefined): PlaceKind | undefined => {
    if (value === undefined) return undefined;
    if (value !== 'read' && value !== 'listen') fail(400, 'kind is read or listen');
    return value as PlaceKind;
  };

  // Personal: never cached anywhere.
  app.get('/v1/places', async (c) => {
    const by = await signedIn(c);
    const limit = Number(c.req.query('limit') ?? 20);
    const places = await listPlaces(catalog, by, { kind: kindOf(c.req.query('kind')), key: c.req.query('key') || undefined, limit: Number.isFinite(limit) ? limit : 20 });
    return c.json({ places }, 200, { 'Cache-Control': 'no-store' });
  });

  app.put('/v1/places', async (c) => {
    const by = await signedIn(c);
    return c.json(await savePlace(catalog, by, await json(c)), 200, { 'Cache-Control': 'no-store' });
  });

  app.delete('/v1/places', async (c) => {
    const by = await signedIn(c);
    const kind = kindOf(c.req.query('kind'));
    const key = c.req.query('key');
    if (!kind || !key) fail(400, 'say which place (kind and key)');
    await forgetPlace(catalog, by, kind!, key!);
    return c.json({ ok: true });
  });

  app.get('/v1/drafts', async (c) => {
    const by = await signedIn(c);
    const limit = Number(c.req.query('limit') ?? 50);
    return c.json({ drafts: await listDrafts(catalog, by, Number.isFinite(limit) ? limit : 50) }, 200, { 'Cache-Control': 'no-store' });
  });

  app.get('/v1/drafts/:place', async (c) => {
    const by = await signedIn(c);
    return c.json({ draft: await getDraft(catalog, by, c.req.param('place')) }, 200, { 'Cache-Control': 'no-store' });
  });

  app.put('/v1/drafts/:place', async (c) => {
    const by = await signedIn(c);
    const input = await json<{ title?: unknown; ops?: unknown }>(c);
    return c.json({ draft: await saveDraft(catalog, by, { place: c.req.param('place'), title: input.title, ops: input.ops }) }, 200, { 'Cache-Control': 'no-store' });
  });

  app.delete('/v1/drafts/:place', async (c) => {
    const by = await signedIn(c);
    await forgetDraft(catalog, by, c.req.param('place'));
    return c.json({ ok: true });
  });

  app.post('/v1/drafts/:place/send', async (c) => {
    const by = await signedIn(c);
    const input = await json<{ title?: unknown; note?: unknown }>(c);
    return c.json(await sendDraft(catalog, by, { place: c.req.param('place'), title: input.title, note: input.note }), 201);
  });

  app.post('/v1/units/:id/translations', async (c) => {
    const by = await signedIn(c);
    const unit = readId(c.req.param('id'));
    if (!unit) fail(400, `"${c.req.param('id')}" is not an id`);
    const input = await json<{ language?: string; credit?: string; licence?: string; translationOf?: string; content?: string; machine?: string }>(c);
    if (typeof input.language !== 'string' || typeof input.credit !== 'string' || typeof input.content !== 'string') fail(400, 'give language, credit and content');
    const translationOf = input.translationOf ? (readId(input.translationOf) ?? fail(400, 'translationOf is an id')) : undefined;
    const suggestion = await addTranslation(catalog, by, {
      unit: unit!,
      language: input.language!,
      credit: input.credit!,
      licence: input.licence || undefined,
      translationOf: translationOf as EntityId | undefined,
      content: input.content!,
      machine: input.machine || undefined,
    });
    return c.json(suggestion, 201);
  });

  app.post('/v1/translations/fix', async (c) => {
    const by = await signedIn(c);
    const input = await json<{ segment?: string; content?: string }>(c);
    const segment = input.segment ? readId(input.segment) : null;
    if (!segment || typeof input.content !== 'string') fail(400, 'give segment and content');
    return c.json(await fixTranslation(catalog, by, { segment: segment!, content: input.content! }), 201);
  });
}
