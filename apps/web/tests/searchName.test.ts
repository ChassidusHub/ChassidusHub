import { describe, expect, it } from 'vitest';
import type { Entity } from '../app/lib/api.js';
import { namedSo, withoutLanguage } from '../app/lib/searchName.js';

const item = (id: string, type: string, data: Record<string, unknown>) => ({ id, type, data }) as unknown as Entity;

describe('a sefer named just what was typed (#233)', () => {
  const sefer = item('w1', 'work', { title: { he: 'ספר לדוגמה', en: 'Sample Sefer' } });
  const shelf = item('s1', 'set', { name: { he: 'ספר לדוגמה', en: 'Sample Sefer' } });
  const english = item('w2', 'work', { title: { he: 'Sample Sefer In English' } });
  const sichos = item('w3', 'work', { title: { en: 'Sample' } });
  const unit = item('u1', 'unit', { label: { en: 'Sample Sefer' } });

  it('finds its whole name in any language, ignoring case, quotes and niqqud, and only sefarim and sets', () => {
    expect(namedSo([unit, sefer, shelf, sichos], 'sample  SEFER').map((i) => i.id)).toEqual(['w1', 's1']);
    expect(namedSo([sefer], 'סֵפֶר "לדוגמה"').map((i) => i.id)).toEqual(['w1']);
    expect(namedSo([sefer], 'Sample')).toEqual([]);
  });

  it('takes a language asked for off the words only when the whole words name nothing', () => {
    expect(withoutLanguage('Tanya in English')).toBe('tanya');
    expect(withoutLanguage('תניא באנגלית')).toBe('תניא');
    expect(withoutLanguage('in English')).toBeNull();
    expect(withoutLanguage('Tanya')).toBeNull();
    expect(namedSo([sefer], 'Sample Sefer in English').map((i) => i.id)).toEqual(['w1']);
    // A sefer whose own name says English is that name; it never falls back to every sefer named the rest.
    expect(namedSo([english, sichos], 'Sample Sefer in English').map((i) => i.id)).toEqual(['w2']);
  });
});
