import { describe, expect, it } from 'vitest';
import type { CartItem, CartSettings } from './cart';
import { addItem, cartQuery, hasItem, itemKey, itemLabel, itemScopeTokens, removeItem, upgradeItem } from './cart';
import { currentMonths, kviusOf } from './kvius';
import { DEFAULT_CUSTOM } from './selection';

const settings: CartSettings = { preset: 'essentials', custom: DEFAULT_CUSTOM, profile: 'opus16', maxMb: 500 };
const tishrei: CartItem = { kind: 'farbrengens', years: [5736, 5740], months: ['01'] };
const volume12: CartItem = { kind: 'library', collection: 'likkuteiSichos', axis: 'volume', groups: [{ slug: '12', name: 'יב' }] };
const alterRebbe: CartItem = { kind: 'works', tokens: ['alter-rebbe'], name: { he: 'ספרי אדמו״ר הזקן', en: "The Alter Rebbe's seforim" } };
const igros34: CartItem = { kind: 'works', tokens: ['igros-kodesh-rebbe:3', 'igros-kodesh-rebbe:4'], name: { he: 'אגרות קודש', en: 'Igros Kodesh' }, parts: [{ he: 'חלק ג', en: 'Volume 3' }, { he: 'חלק ד', en: 'Volume 4' }] };

describe('the cart', () => {
  it('puts farbrengens, library groups and seforim into one query', () => {
    const query = new URLSearchParams(cartQuery([tishrei, volume12, alterRebbe], settings)!);
    expect(query.get('scope')).toBe('5736-01,5740-01,likkuteiSichos:volume:12');
    expect(query.get('works')).toBe('alter-rebbe');
    expect(query.get('sections')).toBe('essentials');
    // A sefer's volumes are its parts, beside the other seforim.
    expect(new URLSearchParams(cartQuery([alterRebbe, igros34], settings)!).get('works')).toBe('alter-rebbe,igros-kodesh-rebbe:3,igros-kodesh-rebbe:4');
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
    expect(itemLabel(volume12)).toEqual({ title: 'לקוטי שיחות', detail: 'חלק יב' });
    expect(itemLabel({ kind: 'library', collection: 'reshimos', axis: null, groups: [] }).detail).toBe('כל הרשימות');
    expect(itemLabel(igros34)).toEqual({ title: 'אגרות קודש', detail: 'חלק ג, חלק ד' });
  });

  it('labels what it holds in English', () => {
    expect(itemLabel(tishrei, 'en')).toEqual({ title: 'Farbrengens: Tishrei', detail: '5736, 5740 (2 years)' });
    expect(itemLabel({ kind: 'farbrengens', years: [5736, 5743], months: ['01'], kvius: true }, 'en')).toEqual({ title: 'Farbrengens: Tishrei, kvius years', detail: '5736 · 5743' });
    expect(itemLabel({ kind: 'farbrengens', years: [5740, 5741, 5742, 5743], months: [] }, 'en')).toEqual({ title: 'Farbrengens, whole years', detail: '5740–5743 (4 years)' });
    expect(itemLabel(volume12, 'en')).toEqual({ title: 'Likkutei Sichos', detail: 'Volume 12' });
    expect(itemLabel({ kind: 'library', collection: 'maamorim', axis: 'parsha', groups: [{ slug: 'bereshit', name: 'בראשית', nameEn: 'Bereishis' }] }, 'en').detail).toBe('Bereishis');
    expect(itemLabel(igros34, 'en')).toEqual({ title: 'Igros Kodesh', detail: 'Volume 3, Volume 4' });
    expect(itemLabel(alterRebbe, 'en').title).toBe("The Alter Rebbe's seforim");
  });

  it('reads a cart an older site kept', () => {
    expect(upgradeItem({ kind: 'works', bundle: 'alter-rebbe', name: 'ספרי אדמו״ר הזקן' })).toEqual({ kind: 'works', tokens: ['alter-rebbe'], name: { he: 'ספרי אדמו״ר הזקן', en: 'ספרי אדמו״ר הזקן' } });
    expect(upgradeItem(tishrei)).toEqual(tishrei);
    expect(upgradeItem({ kind: 'nonsense' })).toBeNull();
    expect(upgradeItem(null)).toBeNull();
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
