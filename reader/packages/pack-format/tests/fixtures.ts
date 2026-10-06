import { createHash } from 'node:crypto';
import type { CatalogEntry } from '@chassidushub-reader/catalog';
import type { ObjectsIndex, PackManifest } from '../src/index.js';
import { OBJECTS_INDEX_SCHEMA_VERSION, PACK_SCHEMA_VERSION, generateKeyPair } from '../src/index.js';

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A throwaway signing key for the test suite only; its seed is public by construction. */
export const TEST_SEED = new Uint8Array(32).map((_, i) => (i * 7 + 3) % 256);
export const testKeyPair = () => generateKeyPair(TEST_SEED);

export const AUDIO_A = new TextEncoder().encode('fake mp3 bytes for JEMSK0001A');
export const AUDIO_B = new TextEncoder().encode('fake mp3 bytes for JEMSK0001B');
export const PDF_1 = new TextEncoder().encode('%PDF-1.4 fake hanacha');
export const PDF_2 = new TextEncoder().encode('%PDF-1.4 fake maamar');

export const SHA_AUDIO_A = sha256(AUDIO_A);
export const SHA_AUDIO_B = sha256(AUDIO_B);
export const SHA_PDF_1 = sha256(PDF_1);
export const SHA_PDF_2 = sha256(PDF_2);

/** One farbrengen with two chapters, a Toras Menachem hanacha and a maamar. */
export const ENTRY: CatalogEntry = {
  occasionId: 11114308,
  hebrewYear: 5736,
  hebrewDate: '5736-01-09',
  occasionLabel: 'ערב יו"כ, אחרי מנחה',
  audio: [
    { workerFilename: 'JEMSK0001A.mp3', durationMs: 1000, chapterName: 'Sicha 1' },
    { workerFilename: 'JEMSK0001B.mp3', durationMs: 2000, chapterName: 'Nigun' },
  ],
  pdfs: [
    { section: 'biltiMugah', label: 'תו"מ חלק א', driveFileId: '1ZPxQJo2BH9LzqJ4O6DRkK_DYTL2ayu4V' },
    { section: 'maamorim', label: 'ד"ה באתי לגני', driveFileId: '1bXM4U1wNj5Nea5fypqMb9Bc3aqW_-uGO' },
  ],
};

export const INDEX: ObjectsIndex = {
  schema: OBJECTS_INDEX_SCHEMA_VERSION,
  version: '1.0.0',
  builtAt: '2026-09-24T00:00:00.000Z',
  objects: {
    [SHA_AUDIO_A]: { kind: 'audio', profile: 'src', bytes: AUDIO_A.byteLength, sourceId: 'JEMSK0001A.mp3', collection: 'farbrengens', itemId: '11114308' },
    [SHA_AUDIO_B]: { kind: 'audio', profile: 'src', bytes: AUDIO_B.byteLength, sourceId: 'JEMSK0001B.mp3', collection: 'farbrengens', itemId: '11114308' },
    [SHA_PDF_1]: { kind: 'pdf', bytes: PDF_1.byteLength, sourceId: '1ZPxQJo2BH9LzqJ4O6DRkK_DYTL2ayu4V', collection: 'farbrengens', itemId: '11114308' },
    [SHA_PDF_2]: { kind: 'pdf', bytes: PDF_2.byteLength, sourceId: '1bXM4U1wNj5Nea5fypqMb9Bc3aqW_-uGO', collection: 'farbrengens', itemId: '11114308' },
  },
};

export function fixtureManifest(): PackManifest {
  return {
    schema: PACK_SCHEMA_VERSION,
    packId: 'test-pack',
    builtAt: '2026-09-24T00:00:00.000Z',
    catalogVersion: '1.0.0',
    profile: { audio: 'src' },
    scope: { kind: 'month', collection: 'farbrengens', hebrewYear: 5736, month: '01', label: { en: 'Tishrei 5736', he: 'תשרי תשל"ו' } },
    entries: [
      {
        collection: 'farbrengens',
        itemId: '11114308',
        hebrewYear: 5736,
        hebrewDate: '5736-01-09',
        label: 'ערב יו"כ, אחרי מנחה',
        refs: [
          { sha256: SHA_AUDIO_A, bytes: AUDIO_A.byteLength, kind: 'audio', profile: 'src', sourceId: 'JEMSK0001A.mp3', role: '0', durationMs: 1000 },
          { sha256: SHA_AUDIO_B, bytes: AUDIO_B.byteLength, kind: 'audio', profile: 'src', sourceId: 'JEMSK0001B.mp3', role: '1', durationMs: 2000 },
          { sha256: SHA_PDF_1, bytes: PDF_1.byteLength, kind: 'pdf', sourceId: '1ZPxQJo2BH9LzqJ4O6DRkK_DYTL2ayu4V', role: 'biltiMugah', label: 'תו"מ חלק א' },
        ],
      },
    ],
    objects: { [SHA_AUDIO_A]: AUDIO_A.byteLength, [SHA_AUDIO_B]: AUDIO_B.byteLength, [SHA_PDF_1]: PDF_1.byteLength },
  };
}
