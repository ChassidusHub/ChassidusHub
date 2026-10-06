import { describe, expect, it } from 'vitest';
import type { CatalogWork, CatalogWorkContents } from '@chassidushub-reader/catalog';
import {
  normalizeSearchText,
  parsePackManifest,
  searchIndexEntry,
  searchIndexQuery,
  textObjectWords,
  withHebrewStems,
  workPackScope,
  workTextEntries,
  workTextSourceId,
} from '../src/index.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

const work: CatalogWork = {
  id: 'tanya',
  title: { he: 'תניא', en: 'Tanya' },
  authors: ['alter-rebbe'],
  genre: 'chassidus',
  levels: [],
  sources: [
    { source: 'chabadlibrary', sourceId: '3400000000', kind: 'text', licence: 'free-to-read', rights: 'link-only' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'he', licence: 'cc-by-nc', rights: 'ship-with-credit', version: 'Kehot' },
    { source: 'sefaria', sourceId: 'Tanya', kind: 'text', language: 'en', licence: 'unknown', rights: 'link-only', version: 'Other' },
  ],
};
const contents: CatalogWorkContents = {
  workId: 'tanya',
  contents: [],
  units: [
    { id: 'part1/1', label: 'פרק א׳', editions: [{ source: 1, sha256: SHA_A, bytes: 10 }, { source: 2 }] },
    // A text kept for a link-only source is never packed, whatever the catalog says.
    { id: 'part1/2', label: 'פרק ב׳', editions: [{ source: 2, sha256: SHA_B, bytes: 5 }] },
    { id: 'part1/3', label: 'פרק ג׳', editions: [{ source: 1, sha256: SHA_C, bytes: 7 }] },
  ],
};

describe('search text', () => {
  it('drops niqqud, gershayim and quotes, lowers case, and leaves only letters and digits', () => {
    expect(normalizeSearchText('וּבְרִיאָה הִיא, ה״ה "Bereshit" (5736)!')).toBe('ובריאה היא הה bereshit 5736');
    expect(normalizeSearchText('תְּהִי צַדִּיק')).toBe('תהי צדיק');
    expect(normalizeSearchText('אוֹר־אֵין־סוֹף')).toBe('אור אין סוף');
  });

  it('adds each Hebrew word without its prefixes, but never shortens a short word', () => {
    expect(withHebrewStems('הבינוני ובהבינוני אב שבת the')).toBe('הבינוני בינוני ובהבינוני בהבינוני הבינוני אב שבת the');
    expect(withHebrewStems('שבהיכל')).toBe('שבהיכל בהיכל היכל');
    expect(withHebrewStems('ואם')).toBe('ואם');
  });

  it('reads a text object\'s words: no heading, no source line, notes and entities kept', () => {
    const html = '<article><h1>פרק א׳</h1><p>תַּנְיָא &amp; <b>הַבֵּינוֹנִי</b><sup class="fn"><a href="#n1">1</a></sup></p><aside class="notes"><p>נִדָּה</p></aside><footer class="source">Kehot · CC BY-NC</footer></article>';
    expect(textObjectWords(html)).toBe('תניא הבינוני בינוני 1 נדה');
  });

  it('makes a query of prefixes, all required, and nothing of punctuation alone', () => {
    expect(searchIndexQuery('אהבה מסותרת')).toBe('אהבה* מסותרת*');
    expect(searchIndexQuery('  ?! ')).toBeNull();
  });
});

describe('work packs', () => {
  it('carries only the texts whose source may ship, one entry per unit', () => {
    const entries = workTextEntries(work, contents);
    expect(entries.map((e) => e.itemId)).toEqual(['tanya/part1/1', 'tanya/part1/3']);
    expect(entries[0]!.refs).toEqual([{ sha256: SHA_A, bytes: 10, kind: 'text', sourceId: workTextSourceId('tanya', SHA_A), role: '1', label: 'Kehot' }]);
    expect(workTextSourceId('tanya', SHA_A)).toBe('work:tanya:aaaaaaaaaaaaaaaa');
  });

  it('makes a manifest the readers accept: the works collection, a search object, a work scope', () => {
    const entries = [searchIndexEntry(work, SHA_B, 99), ...workTextEntries(work, contents)];
    const objects: Record<string, number> = {};
    for (const entry of entries) for (const ref of entry.refs) objects[ref.sha256] = ref.bytes;
    const manifest = { schema: 1, packId: 'x', builtAt: '2026-09-24T00:00:00Z', catalogVersion: '1.3.0', profile: { audio: 'src' }, scope: workPackScope(work), entries, objects };
    const parsed = parsePackManifest(manifest);
    expect(parsed?.scope).toEqual({ kind: 'work', collection: 'works', work: 'tanya', label: { en: 'Tanya', he: 'תניא' } });
    expect(parsed?.entries[0]?.refs[0]).toMatchObject({ kind: 'search', sourceId: 'search:tanya' });
  });
});
