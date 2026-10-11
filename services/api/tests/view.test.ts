import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { add, freshCatalog } from '../../../packages/core/tests/helpers.js';

/** GET /v1/view: one page of the new site in one read (packages/core/src/view.ts). Sample words only. */
describe('GET /v1/view', () => {
  it('answers a page by its path or id, and 404 or 422 otherwise', async () => {
    const { catalog, set } = await freshCatalog();
    const work = await add(catalog, 'steward', 'steward', 'work', { title: { he: 'ספר' }, slug: 'sefer', authors: [], genre: 'sichos', levels: ['sicha'], sets: [set] }, '/sefer');
    const body = { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה' }] }] }] };
    const unit = await add(catalog, 'steward', 'steward', 'unit', { work, position: [{ level: 'sicha', value: '1' }], order: 'a', label: { he: 'שיחה' }, body }, '/sefer/1');
    const app = createApp({ catalog });
    const byPath = await app.request('/v1/view?path=/sefer/1');
    expect(byPath.status).toBe(200);
    expect(await byPath.json()).toMatchObject({ item: { id: unit }, text: { kind: 'words', machine: 'none' }, previous: null, next: null });
    expect((await app.request(`/v1/view?id=${unit}`)).status).toBe(200);
    expect((await app.request('/v1/view?path=/nothing')).status).toBe(404);
    expect((await app.request('/v1/view')).status).toBe(422);
  });
});
