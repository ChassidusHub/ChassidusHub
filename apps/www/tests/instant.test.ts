import { describe, expect, it } from 'vitest';
import { findNames, namesOf, normalize, type NameRow } from '../app/search/instant.js';

/** A few made-up names, in the snapshot's shape (search/instant.ts). */
const rows: NameRow[] = [
  ['sefer', 'ליקוטי שיחות', 'Likkutei Sichos', null, '/likkutei-sichos'],
  ['volume', 'חלק יב', null, 'ליקוטי שיחות', '/likkutei-sichos/12'],
  ['volume', 'חלק א', null, 'ליקוטי שיחות', '/likkutei-sichos/1'],
  ['sicha', 'שמיני א', null, 'ליקוטי שיחות חלק יב', '/likkutei-sichos/12/shemini-1'],
  ['sefer', 'תניא', 'Tanya', null, '/tanya'],
  ['chapter', 'פרק לב', null, 'תניא', '/tanya/32'],
  ['farbrengen', 'י״ט כסלו', null, null, '/farbrengens/5747-03-19', 'י״ט כסלו תשמ״ז'],
  ['farbrengen', '', null, null, '/farbrengens/5747-01-01', 'ש״פ בראשית תשמ״ז'],
];
const index = namesOf({ version: 'test', names: rows });
const paths = (query: string) => findNames(index, query).map((hit) => hit.to);

describe('names as the person types', () => {
  it('ignores niqqud, geresh and quotes', () => {
    expect(normalize('י״ט כִּסְלֵו')).toBe('יט כסלו');
    expect(paths('יט כסלו')).toEqual(['/farbrengens/5747-03-19']);
  });

  it('finds a sefer by its name, not its every volume', () => {
    expect(paths('ליקוטי שיחות')).toEqual(['/likkutei-sichos']);
    expect(paths('likkutei')).toEqual(['/likkutei-sichos']);
  });

  it('spends the sefer name on the parent and finds the volume by its letter', () => {
    expect(paths('ליקוטי שיחות יב')).toEqual(['/likkutei-sichos/12']);
    expect(paths('תניא פרק לב')).toEqual(['/tanya/32']);
  });

  it('matches a short word whole: א is not the start of every word', () => {
    expect(paths('שיחות א')).toEqual(['/likkutei-sichos/1', '/likkutei-sichos/12/shemini-1']);
  });

  it('finds a farbrengen with no name by its date, and draws its date as its title', () => {
    const [hit] = findNames(index, 'בראשית תשמז');
    expect(hit).toMatchObject({ title: 'ש״פ בראשית תשמ״ז', to: '/farbrengens/5747-01-01', kind: 'התוועדות' });
  });

  it('puts sefarim first, and finds nothing for nothing', () => {
    expect(paths('תניא')[0]).toBe('/tanya');
    expect(paths('  ')).toEqual([]);
    expect(paths('אין כזה')).toEqual([]);
  });
});
