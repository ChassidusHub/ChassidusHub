import { describe, expect, it } from 'vitest';
import { kindName, labelName, pieces, threadHref, titleOf } from '../app/people/talk.js';

describe('the words of a report', () => {
  it('links #numbers and @handles, and leaves everything else as it is', () => {
    expect(pieces('ראו #12 ו־@mendy-k, וגם a#3 ו־x@y.org')).toEqual([
      { text: 'ראו ' },
      { text: '#12', to: '/issues/12' },
      { text: ' ו־' },
      { text: '@mendy-k', to: '/u/mendy-k' },
      { text: ', וגם a#3 ו־x@y.org' },
    ]);
    expect(pieces('@mendy at the start')).toEqual([{ text: '@mendy', to: '/u/mendy' }, { text: ' at the start' }]);
    expect(pieces('(#7)')).toEqual([{ text: '(' }, { text: '#7', to: '/issues/7' }, { text: ')' }]);
  });
});

describe('names', () => {
  it('says labels and kinds in Hebrew, and keeps what it does not know', () => {
    expect(labelName('scan')).toBe('סריקה');
    expect(labelName('new-label')).toBe('new-label');
    expect(kindName({ type: 'missing-page' })).toBe('עמוד חסר');
    expect(kindName({ type: 'other', typeTitle: { he: 'משהו אחר' } })).toBe('משהו אחר');
    expect(titleOf({ title: '  ', type: 'bad-scan' })).toBe('סריקה פגומה');
  });

  it('finds where each conversation is on the site', () => {
    expect(threadHref('changeset', 5, '5')).toBe('/suggestions/5');
    expect(threadHref('report', 6, '6')).toBe('/issues/6');
    expect(threadHref('entity', null, 'rh-abc12345', null)).toBe('/rh-abc12345');
    expect(threadHref('entity', null, 'rh-abc12345', '/sample/1')).toBe('/sample/1');
  });
});
