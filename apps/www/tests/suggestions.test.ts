import { describe, expect, it } from 'vitest';
import { entryView, stageWords, eventWords, fieldName, linkParts, statusWords, suggestionPath, suggestionView, valueText } from '../app/suggestions/view.js';

describe('a suggestion as its page shows it', () => {
  it('compares a changed text word by word and shows a name before and after', () => {
    const entry = entryView({
      entityId: 'rh-aaaaaab1',
      type: 'unit',
      before: { label: { he: 'שיחה' } },
      after: { label: { he: 'שיחה א' } },
      changes: [
        { path: '/body/versions/he/segments/p2/text', before: [{ text: 'פסקה שניה' }], after: [{ text: 'פסקה שנייה' }] },
        { path: '/label', before: { he: 'שיחה' }, after: { he: 'שיחה א' } },
      ],
    });
    expect(entry.label).toBe('שיחה א');
    expect(entry.kind).toBe('שיחה');
    expect(entry.fields[0]).toEqual({ kind: 'words', path: '/body/versions/he/segments/p2/text', name: 'המילים', pieces: [{ kind: 'same', text: 'פסקה ' }, { kind: 'gone', text: 'שניה' }, { kind: 'new', text: 'שנייה' }] });
    expect(entry.fields[1]).toEqual({ kind: 'value', path: '/label', name: 'שם', before: 'שיחה', after: 'שיחה א' });
  });

  it('shows a new item by its facts, and counts what does not fit', () => {
    const facts = Object.fromEntries(Array.from({ length: 10 }, (_, at) => [`f${at}`, `ערך ${at}`]));
    const entry = entryView({ entityId: 'rh-x', type: 'segment', before: null, after: facts, changes: [{ path: '', after: facts }] });
    expect(entry.isNew).toBe(true);
    expect(entry.fields.filter((f) => f.kind === 'fact')).toHaveLength(8);
    expect(entry.fields.at(-1)).toEqual({ kind: 'more', count: 2 });
  });

  it('reads the API’s answer: checks, approvals, and whether the person may approve (true or { ok })', () => {
    const raw = {
      changeset: { id: 7, number: 12, title: 'כותרת', author: 'u-1', status: 'open', checks: [{ status: 'warn', message: 'odd' }], checkCounts: { pass: 2, warn: 3, fail: 0 } },
      entries: [],
      reviews: [{ verdict: 'approve' }, { verdict: 'comment' }],
      names: { 'u-1': 'אחד' },
      mayApprove: true,
      mine: false,
    };
    const view = suggestionView(raw);
    expect(view.checks).toEqual({ passed: 2, problems: [{ status: 'warn', message: 'odd' }], more: 2 });
    expect(view.approvals).toBe(1);
    expect(view.mayApprove).toBe(true);
    expect(view.people['u-1']?.name).toBe('אחד');
    expect(suggestionView({ ...raw, mayApprove: { ok: true } }).mayApprove).toBe(true);
    expect(suggestionView({ ...raw, mayApprove: false }).mayApprove).toBe(false);
  });

  it('names fields, values and where it stands in words', () => {
    expect(fieldName('/body/versions/he/segments/p2/text')).toBe('המילים');
    expect(fieldName('')).toBe('הפריט כולו');
    expect(fieldName('/zzz')).toBe('/zzz');
    expect(valueText(null)).toBe('(נמחק)');
    expect(valueText(['a', 'b'])).toBe('a, b');
    expect(statusWords('sent_back')).toBe('הוחזרה עם הערה');
    expect(statusWords('merged', true)).toContain('עלתה לאתר');
    expect(suggestionPath({ id: 9, number: null })).toBe('/suggestions/i9');
    expect(suggestionPath({ id: 9, number: 3 })).toBe('/suggestions/3');
  });

  it('says what happened without knowing who did it', () => {
    const people = { 'u-1': { name: 'שומר' } };
    expect(eventWords('review_requested', { reviewers: ['u-1'] }, people)).toBe('התבקשה בדיקה משומר');
    expect(eventWords('opened', {}, people)).toBeNull();
    expect(eventWords('edited', { upToDate: true }, people)).toBe('עודכנה מול האתר');
  });

  it('links #numbers and @handles in what people wrote', () => {
    expect(linkParts('ראו #12 ושאלו את @sample-keeper.')).toEqual([
      { text: 'ראו ' },
      { text: '#12', to: '/suggestions/12' },
      { text: ' ושאלו את ' },
      { text: '@sample-keeper', to: '/u/sample-keeper' },
      { text: '.' },
    ]);
    expect(linkParts('mail@example.org')).toEqual([{ text: 'mail@example.org' }]);
  });

  it('says where a waiting suggestion stands', () => {
    expect(stageWords({ items: 1, behind: 0, overlaps: 0, blocked: true })).toBe('נעצרה בבדיקה');
    expect(stageWords({ items: 1, behind: 2, overlaps: 0, blocked: false })).toBe('2 השתנו באתר מאז');
    expect(stageWords(undefined)).toBeNull();
  });
});
