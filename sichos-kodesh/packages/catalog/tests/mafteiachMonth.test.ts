import { describe, expect, it } from 'vitest';
import { mafteiachMonthName, mafteiachMonthToken } from '../src/mafteiachMonth.js';

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
