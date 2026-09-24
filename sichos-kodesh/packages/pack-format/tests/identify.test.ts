import { describe, expect, it } from 'vitest';
import { hebrewYearFromGematria, identifyFile, importPlan, parseFolderScope } from '../src/identify.js';
import { INDEX, SHA_AUDIO_A, SHA_PDF_1, SHA_PDF_2 } from './fixtures.js';

describe('folder scopes', () => {
  it('reads numeric and Hebrew year/month folders', () => {
    expect(parseFolderScope('5748/01/x.mp3')).toEqual({ hebrewYear: 5748, month: '01' });
    expect(parseFolderScope('5748-06A/x.mp3')).toEqual({ hebrewYear: 5748, month: '06A' });
    expect(parseFolderScope('תשמ"ח/תשרי/x.mp3')).toEqual({ hebrewYear: 5748, month: '01' });
    expect(parseFolderScope('שיחות תשל"ו/x.mp3')).toEqual({ hebrewYear: 5736 });
    expect(parseFolderScope('random/x.mp3')).toBeNull();
    expect(parseFolderScope('x.mp3')).toBeNull();
  });
  it('turns gematria years into numbers', () => {
    expect(hebrewYearFromGematria('תשמ"ח')).toBe(5748);
    expect(hebrewYearFromGematria("ה'תשי\"א")).toBe(5711);
    expect(hebrewYearFromGematria('תשרי')).toBeNull();
    expect(hebrewYearFromGematria('abc')).toBeNull();
  });
});

describe('identifyFile', () => {
  it('knows a file by hash whatever its name, by our export name, and by its objects/ entry name', () => {
    expect(identifyFile({ path: 'anything.bin', bytes: 1, sha256: SHA_AUDIO_A }, INDEX)).toMatchObject({ status: 'known', sha256: SHA_AUDIO_A });
    expect(identifyFile({ path: `5736/01/${SHA_PDF_1}-hanacha.pdf`, bytes: 1 }, INDEX)).toMatchObject({ status: 'known', sha256: SHA_PDF_1 });
    expect(identifyFile({ path: `pack/objects/${SHA_PDF_2}`, bytes: 1 }, INDEX)).toMatchObject({ status: 'known', sha256: SHA_PDF_2 });
  });
  it('guesses JEM and Drive names when the hash is unknown, with the folder scope', () => {
    expect(identifyFile({ path: '5748/01/JEMSK1234B.mp3', bytes: 1 }, INDEX)).toEqual({ status: 'guessed', kind: 'audio', sourceId: 'JEMSK1234B.mp3', scope: { hebrewYear: 5748, month: '01' } });
    expect(identifyFile({ path: 'AR0020397.mp3', bytes: 1 }, INDEX)).toMatchObject({ status: 'guessed', kind: 'audio', sourceId: 'AR0020397.mp3', scope: null });
    expect(identifyFile({ path: 'hanacha 1pDtfuN6gAoG40Ce-1yRqbtfVlFUl1jLp.pdf', bytes: 1 }, INDEX)).toMatchObject({ status: 'guessed', kind: 'pdf', sourceId: '1pDtfuN6gAoG40Ce-1yRqbtfVlFUl1jLp' });
    expect(identifyFile({ path: 'notes.txt', bytes: 1 }, INDEX)).toEqual({ status: 'unknown', scope: null });
    expect(identifyFile({ path: 'manifest.json', bytes: 1 }, INDEX)).toEqual({ status: 'manifest' });
  });
});

describe('importPlan', () => {
  it('stores known-and-missing, skips held and duplicates, keeps guesses and unknowns apart', () => {
    const plan = importPlan(
      [
        { path: 'a.mp3', bytes: 5, sha256: SHA_AUDIO_A },
        { path: 'copy of a.mp3', bytes: 5, sha256: SHA_AUDIO_A },
        { path: 'b.pdf', bytes: 5, sha256: SHA_PDF_1 },
        { path: '5748/01/JEMSK9999A.mp3', bytes: 7 },
        { path: 'readme.txt', bytes: 2 },
        { path: 'manifest.json', bytes: 2 },
      ],
      INDEX,
      [SHA_PDF_1],
    );
    expect(plan.store.map((s) => s.sha256)).toEqual([SHA_AUDIO_A]);
    expect(plan.held).toBe(2);
    expect(plan.guessed).toHaveLength(1);
    expect(plan.unknown).toEqual([{ path: 'readme.txt', bytes: 2 }]);
    expect(plan.hasManifest).toBe(true);
    expect(plan.bytesToStore).toBe(INDEX.objects[SHA_AUDIO_A]!.bytes);
  });
});
