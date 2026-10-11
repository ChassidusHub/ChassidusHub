import { describe, expect, it } from 'vitest';
import { nounFor, noTextFor, unitKind } from '../app/lib/unitKind.js';
import { isYours } from '../app/ui/Header.js';

describe('unitKind', () => {
  it('reads the last level, then the genre, then the name', () => {
    expect(unitKind({ genre: 'maamarim', levels: ['year', 'maamar'] })).toBe('maamar');
    expect(unitKind({ genre: 'sichos', levels: ['volume'] })).toBe('sicha');
    expect(unitKind({ genre: 'igros' })).toBe('letter');
    expect(unitKind({ genre: 'chassidus', levels: ['volume'], title: { he: 'Maamarim - Chassidic Discourses' } })).toBe('maamar');
    expect(unitKind({ genre: 'chassidus' })).toBe('item');
    expect(unitKind(undefined)).toBe('item');
  });
  it('counts in the singular for one', () => {
    expect(nounFor('printing', 1, 'en')).toBe('printing');
    expect(nounFor('printing', 2, 'en')).toBe('printings');
    expect(nounFor('maamar', 52, 'en')).toBe('maamarim');
    expect(nounFor('maamar', 52, 'he')).toBe('מאמרים');
  });
  it('says no text in its kind', () => {
    expect(noTextFor('maamar', 'en')).toBe('This maamar has no text here yet.');
  });
});

describe('isYours', () => {
  it('lights You on own pages, not on search', () => {
    expect(isYours('/search')).toBe(false);
    expect(isYours('/suggestions')).toBe(false);
    expect(isYours('/account')).toBe(true);
    expect(isYours('/u/someone')).toBe(true);
  });
});
