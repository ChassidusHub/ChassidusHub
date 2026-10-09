import { describe, expect, it } from 'vitest';
import { clashKey, editable, listStage, readTyped, resolutionsOf, sideOf, stageSteps, type MergeCheckView, type Resolution } from '../app/lib/merge.js';

describe('the merge panel', () => {
  it('sends each clash choice under its item and field, and a choice for all as *', () => {
    const choices = new Map<string, Resolution>([
      [clashKey({ entityId: 'rh-a', path: '/title' }), { take: 'theirs' }],
      [clashKey({ entityId: 'rh-a', path: '/data/year' }), { value: 5740 }],
      [clashKey({ entityId: 'rh-b', path: '/title' }), { take: 'ours' }],
    ]);
    expect(resolutionsOf(choices)).toEqual({ 'rh-a': { '/title': { take: 'theirs' }, '/data/year': { value: 5740 } }, 'rh-b': { '/title': { take: 'ours' } } });
    expect(resolutionsOf(new Map(), { take: 'ours' })).toEqual({ '*': { '*': { take: 'ours' } } });
    expect([sideOf({ take: 'ours' }), sideOf({ value: 'x' }), sideOf(null)]).toEqual(['ours', 'own', null]);
  });

  it('reads typed words back as the field’s kind', () => {
    expect(readTyped('שלום', 'x')).toEqual({ ok: true, value: 'שלום' });
    expect(readTyped('5741', 5740)).toEqual({ ok: true, value: 5741 });
    expect(readTyped('"5741"', 5740)).toEqual({ ok: false });
    expect(readTyped('[1,2]', [1])).toEqual({ ok: true, value: [1, 2] });
    expect(readTyped('{', {})).toEqual({ ok: false });
    expect(editable({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(editable(undefined)).toBe('');
  });

  it('names a row’s stage, worst first', () => {
    expect(listStage({ items: 2, behind: 1, overlaps: 3, blocked: true }, 'en')?.tone).toBe('closed');
    expect(listStage({ items: 2, behind: 1, overlaps: 3, blocked: false }, 'en')).toEqual({ tone: 'attention', words: '1 changed on the site since' });
    expect(listStage({ items: 2, behind: 0, overlaps: 1, blocked: false }, 'en')?.words).toBe('Shares items with 1 other');
    expect(listStage({ items: 2, behind: 0, overlaps: 0, blocked: false }, 'en')?.tone).toBe('ok');
    expect(listStage(undefined, 'en')).toBeNull();
  });

  it('walks the stage strip from sent to in the library', () => {
    type Check = Parameters<typeof stageSteps>[0];
    const base: Omit<Check, 'stage' | 'clashes'> = { status: 'open', blocking: [], problems: [], behind: 0, approvals: 0 };
    const clash = { entityId: 'rh-a', type: 'sefer', path: '/title', base: 'a', ours: 'b', theirs: 'c', decided: null } as unknown as MergeCheckView['clashes'][number];
    const problem = { kind: 'invalid', entityId: 'rh-a', message: 'no title' } as MergeCheckView['problems'][number];
    const states = (check: Check) => stageSteps(check, 'en').map((s) => s.state);
    expect(states({ ...base, stage: 'clashes', clashes: [clash] })).toEqual(['done', 'done', 'now', 'todo', 'todo']);
    expect(states({ ...base, stage: 'ready', clashes: [] })).toEqual(['done', 'done', 'done', 'now', 'todo']);
    expect(states({ ...base, status: 'merged', stage: 'merged', clashes: [] })).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(states({ ...base, stage: 'blocked', clashes: [], problems: [problem] })[1]).toBe('stopped');
  });
});
