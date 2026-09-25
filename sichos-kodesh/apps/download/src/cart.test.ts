import { describe, expect, it } from 'vitest';
import type { CartItem, CartSettings } from './cart';
import { addItem, cartQuery, hasItem, itemKey, itemLabel, itemScopeTokens, removeItem } from './cart';
import { currentMonths, kviusOf } from './kvius';
import { DEFAULT_CUSTOM } from './selection';

const settings: CartSettings = { preset: 'essentials', custom: DEFAULT_CUSTOM, profile: 'opus16', maxMb: 500 };
const tishrei: CartItem = { kind: 'farbrengens', years: [5736, 5740], months: ['01'] };
const volume12: CartItem = { kind: 'library', collection: 'likkuteiSichos', axis: 'volume', groups: [{ slug: '12', name: 'יב' }] };
const alterRebbe: CartItem = { kind: 'works', bundle: 'alter-rebbe', name: 'ספרי אדמו״ר הזקן' };

describe('the cart', () => {
  it('puts farbrengens, library groups and seforim into one query', () => {
    const query = new URLSearchParams(cartQuery([tishrei, volume12, alterRebbe], settings)!);
    expect(query.get('scope')).toBe('5736-01,5740-01,likkuteiSichos:volume:12');
    expect(query.get('works')).toBe('alter-rebbe');
    expect(query.get('sections')).toBe('essentials');
    expect(query.get('profile')).toBe('opus16');
    expect(query.get('maxMb')).toBe('500');
  });

  it('asks for seforim alone without a scope, and for nothing when it is empty', () => {
    const query = new URLSearchParams(cartQuery([alterRebbe], settings)!);
    expect(query.has('scope')).toBe(false);
    expect(query.get('works')).toBe('alter-rebbe');
    expect(cartQuery([], settings)).toBeNull();
    // Farbrengens with no content picked select nothing.
    const none = { ...settings, preset: 'custom' as const, custom: { audio: false, sichosKodesh: false, torasMenachem: false, mugah: false, maamorim: false, hagahos: false, hosofos: false } };
    expect(cartQuery([tishrei], none)).toBeNull();
    expect(cartQuery([volume12], none)).not.toBeNull();
  });

  it('keeps each thing once: adding it again replaces it, and removing takes it out', () => {
    let items = addItem([], tishrei);
    items = addItem(items, volume12);
    items = addItem(items, { ...tishrei });
    expect(items).toHaveLength(2);
    expect(hasItem(items, tishrei)).toBe(true);
    items = removeItem(items, itemKey(tishrei));
    expect(items).toEqual([volume12]);
  });

  it('names Adar as the year has it, and a whole collection by its name', () => {
    expect(itemScopeTokens({ kind: 'farbrengens', years: [5736, 5737], months: ['06'] })).toEqual(['5736-06A', '5736-06B', '5737-06']);
    expect(itemScopeTokens({ kind: 'farbrengens', years: [5736], months: [] })).toEqual(['5736']);
    expect(itemScopeTokens({ kind: 'library', collection: 'reshimos', axis: null, groups: [] })).toEqual(['reshimos']);
  });

  it('labels what it holds in Hebrew', () => {
    expect(itemLabel(tishrei)).toEqual({ title: 'התוועדויות תשרי', detail: 'תשל״ו, תש״מ (2 שנים)' });
    expect(itemLabel({ kind: 'farbrengens', years: [5736], months: ['01'], kvius: true }).title).toBe('התוועדויות תשרי בשנת הקביעות');
    expect(itemLabel({ kind: 'farbrengens', years: [5736, 5743], months: ['01'], kvius: true }).title).toBe('התוועדויות תשרי בשנות הקביעות');
    expect(itemLabel({ kind: 'farbrengens', years: [5740, 5741, 5742, 5743], months: [] })).toEqual({ title: 'התוועדויות, השנה כולה', detail: 'תש״מ–תשמ״ג (4 שנים)' });
    expect(itemLabel(volume12)).toEqual({ title: 'לקוטי שיחות', detail: 'יב' });
    expect(itemLabel({ kind: 'library', collection: 'reshimos', axis: null, groups: [] }).detail).toBe('כל הרשימות');
  });
});

describe('the kvius', () => {
  it("finds this year's kvius among the published years", () => {
    // 14 Tishrei 5787: a זשה year, whose only match in the archive's span is 5736.
    const kvius = kviusOf(new Date('2026-09-25T12:00:00Z'), [5710, 5736, 5740]);
    expect(kvius).toEqual({ year: 5787, code: 'זשה', years: [5736] });
    expect(kviusOf(new Date('2026-09-25T12:00:00Z'), [5710]).years).toEqual([]);
  });

  it('knows this month and the next, Adar as one', () => {
    expect(currentMonths(new Date('2026-09-25T12:00:00Z'))).toEqual({ now: '01', next: '02' });
    expect(currentMonths(new Date('2027-03-10T12:00:00Z'))).toEqual({ now: '06', next: '07' });
    expect(currentMonths(new Date('2027-09-15T12:00:00Z'))).toEqual({ now: '12', next: '01' });
  });
});
