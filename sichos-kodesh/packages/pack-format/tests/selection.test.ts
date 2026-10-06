import { describe, expect, it } from 'vitest';
import { ALL_CONTENT_TYPES } from '@sichos-kodesh/app-core';
import { sizeSelection } from '../src/selection.js';
import { AUDIO_A, AUDIO_B, ENTRY, INDEX, PDF_1, PDF_2, SHA_PDF_2 } from './fixtures.js';

describe('sizeSelection', () => {
  it('is exact from the index and yields pack entries keyed by occasion', () => {
    const size = sizeSelection([ENTRY], ALL_CONTENT_TYPES, INDEX, 'src');
    expect(size.bytes).toBe(AUDIO_A.byteLength + AUDIO_B.byteLength + PDF_1.byteLength + PDF_2.byteLength);
    expect(size.missing).toEqual([]);
    expect(size.entries).toHaveLength(1);
    const entry = size.entries[0]!;
    expect(entry).toMatchObject({ collection: 'farbrengens', itemId: '11114308', hebrewYear: 5736, hebrewDate: '5736-01-09' });
    expect(entry.refs.map((r) => r.kind)).toEqual(['audio', 'audio', 'pdf', 'pdf']);
    expect(entry.refs[0]).toMatchObject({ profile: 'src', role: '0', durationMs: 1000 });
    expect(entry.refs[2]).toMatchObject({ role: 'biltiMugah' });
  });
  it('drops content types the user turned off and reports objects the index lacks', () => {
    const audioOnly = sizeSelection([ENTRY], { ...ALL_CONTENT_TYPES, hanachaEditions: [], mugah: false, maamorim: false, hagahos: false, hosofos: false }, INDEX, 'src');
    expect(Object.keys(audioOnly.objects)).toHaveLength(2);
    const opus = sizeSelection([ENTRY], ALL_CONTENT_TYPES, INDEX, 'opus24');
    expect(opus.missing.map((t) => t.kind)).toEqual(['audio', 'audio']);
    expect(opus.objects[SHA_PDF_2]).toBe(PDF_2.byteLength);
  });
});
