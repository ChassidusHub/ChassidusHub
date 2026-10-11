import { beforeEach, describe, expect, it } from 'vitest';
import { Catalog, itemView, registerFile } from '@chassidushub/core';
import { measured } from '@chassidushub/db';
import type { EntityId } from '@chassidushub/model';
import { add, freshCatalog } from './helpers.js';

/** One read for one page of the new site (packages/core/src/view.ts); every word here is sample text. */
describe('an item view', () => {
  let catalog: Catalog;
  let set: EntityId;
  let work: EntityId;

  beforeEach(async () => {
    ({ catalog, set } = await freshCatalog());
    work = await add(catalog, 'steward', 'steward', 'work', { title: { he: 'ספר' }, slug: 'sefer', authors: [], genre: 'sichos', levels: ['volume', 'sicha'], sets: [set] }, '/sefer');
  });

  const unit = (n: string, extra: Record<string, unknown> = {}) =>
    add(catalog, 'steward', 'steward', 'unit', { work, position: [{ level: 'volume', value: '1' }, { level: 'sicha', value: n }], order: `a${n}`, label: { he: `שיחה ${n}` }, ...extra }, `/sefer/1/${n}`);

  const counted = () => {
    const db = measured(catalog.db);
    return { db, catalog: new Catalog(db) };
  };

  it('draws a unit with words of its own in five statements: facts, path bar, neighbours, its scan and recordings', async () => {
    await unit('1');
    const words = { profile: 'sichos-kodesh', versions: [{ id: 'he', language: 'he', segments: [
      { id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה א' }] },
      { id: 'p2', kind: 'paragraph', text: [{ text: 'לדוגמה ב' }], origin: { by: 'ocr:test' } },
    ] }] };
    await unit('2', { body: words });
    await unit('3');
    const { db, catalog: c } = counted();
    const view = (await itemView(c, { path: '/sefer/1/2' }))!;
    expect(db.cost.statements).toBe(5);
    expect([view.scan, view.recordings]).toEqual([null, []]);
    expect(view.item.data).not.toHaveProperty('body');
    expect(view.pathBar.map((l) => l.kind)).toEqual(['set', 'work', 'part', 'unit']);
    expect([view.previous?.path, view.next?.path]).toEqual(['/sefer/1/1', '/sefer/1/3']);
    expect(view.text).toMatchObject({ kind: 'words', from: 'body', version: 'he', machine: 'some', versions: [{ version: 'he', from: 'body' }] });
    expect(view.text?.kind === 'words' && view.text.segments.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it("marks a machine's words inside a section and in the notes as machine", async () => {
    const words = { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [
      { id: 's1', kind: 'section', children: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה' }], origin: { by: 'ocr:test' } }] },
    ], notes: [{ id: 'n1', kind: 'note', text: [{ text: 'הערה לדוגמה' }] }] }] };
    await unit('1', { body: words });
    const view = (await itemView(catalog, { path: '/sefer/1/1' }))!;
    expect(view.text).toMatchObject({ kind: 'words', machine: 'some' });
  });

  it("writes a version's machine origin onto each of its segments with words, and counts them all as machine", async () => {
    const words = { profile: 'plain', versions: [{ id: 'he', language: 'he', origin: { by: 'ocr:test' }, segments: [
      { id: 's1', kind: 'section', children: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה' }] }] },
      { id: 'p2', kind: 'paragraph', text: [{ text: 'לדוגמה ב' }] },
    ], notes: [{ id: 'n1', kind: 'note', text: [{ text: 'הערה לדוגמה' }] }] }] };
    await unit('1', { body: words });
    const view = (await itemView(catalog, { path: '/sefer/1/1' }))!;
    if (view.text?.kind !== 'words') throw new Error('expected words');
    expect(view.text.machine).toBe('all');
    expect(view.text.segments[0]!.origin).toBeUndefined();
    expect(view.text.segments[0]!.children![0]!.origin).toEqual({ by: 'ocr:test' });
    expect(view.text.segments[1]!.origin).toEqual({ by: 'ocr:test' });
    expect(view.text.notes[0]!.origin).toEqual({ by: 'ocr:test' });
  });

  it("falls back to a text of the unit, marking a machine's unchecked paragraphs", async () => {
    const u = await unit('1');
    const text = await add(catalog, 'steward', 'steward', 'text', { kind: 'edition', unit: u, language: 'he', licence: 'cc0' });
    await add(catalog, 'steward', 'steward', 'segment', { text, order: 'a', kind: 'paragraph', content: 'לדוגמה', proofread: 0, origin: { by: 'ocr:test' } });
    await add(catalog, 'steward', 'steward', 'segment', { text, order: 'b', kind: 'paragraph', content: 'לדוגמה', proofread: 1, origin: { by: 'ocr:test' } });
    const { db, catalog: c } = counted();
    const view = (await itemView(c, { id: u }))!;
    expect(db.cost.statements).toBe(6);
    expect(view.text).toMatchObject({ kind: 'words', from: 'text', text, machine: 'some' });
    expect(view.text?.kind === 'words' && view.text.segments.map((s) => Boolean(s.origin))).toEqual([true, false]);
  });

  it('falls back to the pages of a scan the unit is printed on, in six statements', async () => {
    const u = await unit('1');
    const sha256 = 'a'.repeat(64);
    await registerFile(catalog.db, { sha256, bytes: 1000, mime: 'application/pdf', source: 'contribution', licence: 'cc0', held: true });
    const publication = await add(catalog, 'steward', 'steward', 'publication', { kind: 'book-volume', title: { he: 'ספר א' }, work });
    const scan = await add(catalog, 'steward', 'steward', 'scan', { publication, file: sha256, completeness: 'complete', pageLabels: [{ pdfPage: 5, printed: '1' }, { pdfPage: 7, printed: '3' }] });
    await add(catalog, 'steward', 'steward', 'contents-map', { publication, unit: u, pages: { from: 1, to: 3, scheme: 'printed' } });
    const { db, catalog: c } = counted();
    const view = (await itemView(c, { id: u }))!;
    expect(db.cost.statements).toBe(6);
    expect(view.text).toEqual({ kind: 'pages', scan, file: sha256, firstPage: 5, lastPage: 7, publication, url: `/objects/${sha256}` });
    expect(view.scan).toEqual({ scan, file: sha256, firstPage: 5, lastPage: 7, publication, url: `/objects/${sha256}` });
  });

  it("gives a unit with words its scan too, and the recordings of its farbrengen, in five statements", async () => {
    const event = await add(catalog, 'steward', 'steward', 'event', { kind: 'farbrengen', title: { he: 'התוועדות לדוגמה' }, date: '5742-05-10', sets: [set] }, '/farbrengens/5742-05-10');
    const second = await add(catalog, 'steward', 'steward', 'recording', { event, title: { he: 'חלק ב' }, part: 2, url: 'https://example.org/b.mp3', sets: [set] });
    const first = await add(catalog, 'steward', 'steward', 'recording', { event, title: { he: 'חלק א' }, part: 1, durationMs: 60_000, url: 'https://example.org/a.mp3', sets: [set] });
    const u = await unit('1', { events: [event], body: { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה' }] }] }] } });
    const sha256 = 'b'.repeat(64);
    await registerFile(catalog.db, { sha256, bytes: 1000, mime: 'application/pdf', source: 'contribution', licence: 'cc0', held: true });
    const publication = await add(catalog, 'steward', 'steward', 'publication', { kind: 'book-volume', title: { he: 'ספר א' }, work });
    const scan = await add(catalog, 'steward', 'steward', 'scan', { publication, file: sha256, completeness: 'complete' });
    await add(catalog, 'steward', 'steward', 'contents-map', { publication, unit: u, pages: { from: 3, to: 4, scheme: 'pdf' } });
    const { db, catalog: c } = counted();
    const view = (await itemView(c, { id: u }))!;
    expect(db.cost.statements).toBe(5);
    expect(view.text).toMatchObject({ kind: 'words' });
    expect(view.scan).toMatchObject({ scan, firstPage: 3, lastPage: 4 });
    expect(view.recordings).toMatchObject([
      { id: first, name: { he: 'חלק א' }, durationMs: 60_000 },
      { id: second, name: { he: 'חלק ב' }, durationMs: null },
    ]);
  });

  it('says why words are held back, and has nothing for a unit with no words anywhere', async () => {
    const held = await unit('1', { body: { profile: 'plain', versions: [{ id: 'he', language: 'he', segments: [{ id: 'p1', kind: 'paragraph', text: [{ text: 'לדוגמה' }] }] }] }, bodySource: { source: 'chabadlibrary', rights: 'link', licence: 'site-terms', url: 'https://example.test/1' } });
    const view = (await itemView(catalog, { id: held }))!;
    expect(view.text).toMatchObject({ kind: 'withheld', url: 'https://example.test/1' });
    const empty = await unit('2');
    expect((await itemView(catalog, { id: empty }))!.text).toBeNull();
    expect(await itemView(catalog, { path: '/nothing/here' })).toBeNull();
  });
});
