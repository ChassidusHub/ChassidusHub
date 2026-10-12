import { describe, expect, it } from 'vitest';
import type { PageSegment } from '@chassidushub/model';
import { layoutLetter, letterLayout } from '../app/views/letters.layout.js';
import { notesHtml, unmarkedNotes, wordsHtml } from '../app/reader/words.server.js';

const p = (id: string, text: string, extra: Partial<PageSegment> = {}): PageSegment => ({ id, kind: 'paragraph', text: [{ text }], ...extra });

/** Igros Kodesh, vol. 3, letter 410 (תי), as /v1/view gives its words: the date line and the signature marked for the end side. */
const letter = [
  p('a', 'ב"ה, ט\' תשרי, תש"ט', { end: true }),
  p('b', 'הרה"ג והרה"ח הוו"ח אי"א נו"מ וכו\' מהור"י'),
  p('c', "שי'"),
  p('d', 'שלום וברכה!'),
  p('e', 'במכ\' מכ"ד אלול, במענה על שאלתו'),
  p('f', 'ואסיים בברכת חוגמח"ט'),
  p('g', 'הרב מנחם שניאורסאהן', { end: true }),
];

/** A letter is set as app.chassidushub.org sets it (Sichos-Kodesh app-core layoutLetter). */
describe('a letter’s layout', () => {
  it('places the date line, the addressee, the greeting, the body and the signature', () => {
    expect(Object.fromEntries(layoutLetter(letter))).toEqual({ a: 'dateline', b: 'addressee', c: 'addressee', d: 'greeting', e: 'body', f: 'body', g: 'signature' });
  });

  it('puts a second line marked for the end side under the date as the city', () => {
    const roles = layoutLetter([p('a', 'ב"ה, כ"ח טבת תרפ"ט', { end: true }), p('b', 'ריגא', { end: true }), p('c', 'ה"ה מו"ה זעליק נ"י'), p('d', 'לברכה ושלום רב!'), p('e', 'מכתבו הגיעני.')]);
    expect(roles.get('b')).toBe('place');
    // לברכה is not a greeting by the app's rule: with none found, the rest is body.
    expect(roles.get('c')).toBe('body');
  });

  it('keeps a letter with no greeting as body, and never calls a long line a greeting', () => {
    const roles = layoutLetter([p('a', 'ב"ה', { end: true }), p('b', `שלום ${'א'.repeat(40)}`), p('c', 'ועוד')]);
    expect([roles.get('b'), roles.get('c')]).toEqual(['body', 'body']);
  });

  it('draws each place as a class, in place of the end side it came with', () => {
    const html = wordsHtml(letter, [], 'אגרת תי', letterLayout);
    expect(html).toContain('<p id="s-a" class="l-dateline">');
    expect(html).toContain('<p id="s-d" class="l-greeting">שלום וברכה!</p>');
    expect(html).toContain('<p id="s-g" class="l-signature">');
    expect(html).not.toContain('class="end"');
  });

  it('lists the notes on the whole letter unnumbered, and numbers a note the words point to', () => {
    const words = [p('a', 'ב"ה', { end: true }), { id: 'b', kind: 'paragraph', text: [{ text: 'שאלתי' }, { note: 'n2' }] } as PageSegment];
    const notes: PageSegment[] = [p('n1', 'מהעתק המזכירות', { kind: 'note' }), p('n2', 'ראה לעיל', { kind: 'note' })];
    const html = notesHtml(notes, unmarkedNotes(words, notes));
    expect(html).toContain('<li id="n-n1" class="fn"><span class="nt">מהעתק המזכירות</span></li>');
    expect(html).toContain('<span class="fl">2</span>');
    expect(wordsHtml(words, notes, '', letterLayout)).toContain('aria-label="הערה 2">2</a>');
  });
});
