import { describe, expect, it } from 'vitest';
import { ALL_CONTENT_TYPES } from '@sichos-kodesh/app-core';
import type { ObjectsIndex } from '../src/objectsIndex.js';
import { buildSourceLookup, parseObjectsIndex, sourceKey } from '../src/objectsIndex.js';
import { sizeSelection } from '../src/selection.js';
import { AUDIO_A, ENTRY, INDEX, SHA_AUDIO_A } from './fixtures.js';

// JEM serves chapter 1's bytes under a second name too: the catalog lists both.
const TWIN = 'AR0018053.mp3';
const withTwin: ObjectsIndex = { ...INDEX, objects: { ...INDEX.objects, [SHA_AUDIO_A]: { ...INDEX.objects[SHA_AUDIO_A]!, aliases: [TWIN] } } };
const entry = { ...ENTRY, audio: [...ENTRY.audio, { workerFilename: TWIN, durationMs: 1000, chapterName: 'Sicha 1 (again)' }] };

describe('a name for the same bytes', () => {
  it('reads and keeps an alias, and rejects a malformed one', () => {
    expect(parseObjectsIndex(JSON.parse(JSON.stringify(withTwin)))!.objects[SHA_AUDIO_A]!.aliases).toEqual([TWIN]);
    const bad = JSON.parse(JSON.stringify(withTwin));
    bad.objects[SHA_AUDIO_A].aliases = [''];
    expect(parseObjectsIndex(bad)).toBeNull();
    // An index without aliases reads as before.
    expect(parseObjectsIndex(JSON.parse(JSON.stringify(INDEX)))!.objects[SHA_AUDIO_A]!.aliases).toBeUndefined();
  });

  it("finds the object by either name; an alias never takes over another object's own name", () => {
    const lookup = buildSourceLookup(withTwin);
    expect(lookup.get(sourceKey('audio', TWIN, 'src'))).toBe(SHA_AUDIO_A);
    expect(lookup.get(sourceKey('audio', 'JEMSK0001A.mp3', 'src'))).toBe(SHA_AUDIO_A);
    const [other] = Object.entries(INDEX.objects).find(([sha, e]) => sha !== SHA_AUDIO_A && e.kind === 'audio')!;
    const clash: ObjectsIndex = { ...withTwin, objects: { ...withTwin.objects, [SHA_AUDIO_A]: { ...withTwin.objects[SHA_AUDIO_A]!, aliases: [INDEX.objects[other]!.sourceId] } } };
    expect(buildSourceLookup(clash).get(sourceKey('audio', INDEX.objects[other]!.sourceId, 'src'))).toBe(other);
  });

  it('takes the chapter listed under the second name: nothing missing, the bytes once', () => {
    const without = sizeSelection([entry], ALL_CONTENT_TYPES, INDEX, 'src');
    expect(without.missing.map((t) => t.workerFilename)).toEqual([TWIN]);
    const selection = sizeSelection([entry], ALL_CONTENT_TYPES, withTwin, 'src');
    expect(selection.missing).toEqual([]);
    expect(selection.bytes).toBe(without.bytes);
    const refs = selection.entries[0]!.refs.filter((r) => r.sha256 === SHA_AUDIO_A);
    expect(refs.map((r) => r.sourceId)).toEqual(['JEMSK0001A.mp3', TWIN]);
    expect(refs.every((r) => r.bytes === AUDIO_A.length)).toBe(true);
  });
});
