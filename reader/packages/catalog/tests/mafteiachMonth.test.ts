import { describe, expect, it } from 'vitest';
import { mafteiachDay, mafteiachMonthName, mafteiachMonthNameHebrew, mafteiachMonthToken } from '../src/mafteiachMonth.js';

describe('mafteiachMonthToken', () => {
  it('extracts a plain two-digit month token', () => {
    expect(mafteiachMonthToken('5711-05-10')).toBe('05');
  });

  it('extracts a leap-year Adar I/II token', () => {
    expect(mafteiachMonthToken('5711-06A-01')).toBe('06A');
    expect(mafteiachMonthToken('5711-06B-07')).toBe('06B');
  });

  it('is unaffected by a trailing same-date-disambiguator letter on the day', () => {
    expect(mafteiachMonthToken('5738-01-09b')).toBe('01');
  });
});

describe('mafteiachMonthName', () => {
  it('names Tishrei through Elul in mafteiach-index order', () => {
    expect(mafteiachMonthName('5711-01-01')).toBe('Tishrei');
    expect(mafteiachMonthName('5711-05-10')).toBe('Shevat');
    expect(mafteiachMonthName('5711-07-01')).toBe('Nisan');
    expect(mafteiachMonthName('5711-12-18')).toBe('Elul');
  });

  it('names a leap year\'s split Adar', () => {
    expect(mafteiachMonthName('5711-06A-01')).toBe('Adar I');
    expect(mafteiachMonthName('5711-06B-14')).toBe('Adar II');
  });

  it('names a non-leap year\'s plain Adar', () => {
    expect(mafteiachMonthName('5712-06-01')).toBe('Adar');
  });
});

describe('mafteiachMonthNameHebrew', () => {
  it('names Tishrei through Elul in Hebrew', () => {
    expect(mafteiachMonthNameHebrew('5711-01-01')).toBe('תשרי');
    expect(mafteiachMonthNameHebrew('5711-05-10')).toBe('שבט');
    expect(mafteiachMonthNameHebrew('5711-12-18')).toBe('אלול');
  });

  it('names a leap year\'s split Adar in Hebrew', () => {
    expect(mafteiachMonthNameHebrew('5711-06A-01')).toBe('אדר א׳');
    expect(mafteiachMonthNameHebrew('5711-06B-14')).toBe('אדר ב׳');
  });
});

describe('mafteiachDay', () => {
  it('extracts a plain day number', () => {
    expect(mafteiachDay('5711-05-10')).toBe(10);
  });

  it('strips a trailing same-date-disambiguator letter', () => {
    expect(mafteiachDay('5738-01-09b')).toBe(9);
    expect(mafteiachDay('5712-12-30c')).toBe(30);
  });
});
