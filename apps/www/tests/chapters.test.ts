import { describe, expect, it } from 'vitest';
import type { ItemView } from '@chassidushub/client';
import type { PageSegment } from '@chassidushub/model';
import { chaptersLayout, quietParens, simanChips } from '../app/views/chapters.layout.js';
import { chapterLabel, shortTitle } from '../app/views/chapters.js';
import { wordsHtml } from '../app/reader/words.server.js';

const verse = (id: string, text: PageSegment['text']): PageSegment => ({ n: Number(id), id, kind: 'verse', text });

/** A chapter of Tanya and a siman of Shulchan Aruch HaRav, as /v1/view gives them (sample words). */
const tanya = { position: [{ level: 'part', value: '1' }, { level: 'chapter', value: '4' }] };
const siman = (edition?: string) => ({ position: [{ level: 'section', value: '2', label: { he: 'אורח חיים' } }, { level: 'siman', value: '1', ...(edition ? { label: { he: edition } } : {}) }] });

describe('a chapter of Tanya', () => {
  const words = [verse('1', [{ marker: '[מ: כד כסלו]' }, { text: ' ' }, { text: 'פתיחה', marks: ['b'] }, { text: ' לדוגמה.' }]), verse('2', [{ text: 'פסקה לדוגמה.' }])];

  it('keeps the opening words bold as printed, and the markers in the words (hidden by the view)', () => {
    const html = wordsHtml(words, [], 'פרק א׳', chaptersLayout, tanya);
    expect(html).toBe('<p id="s-1"><span class="mk">[מ: כד כסלו]</span> <b>פתיחה</b> לדוגמה.</p><p id="s-2">פסקה לדוגמה.</p>');
  });

  it('sets each paragraph beside its translation, matched by id, each numbered in its own margin, the translation only read', () => {
    const english = [verse('1', [{ text: 'An opening, for example.' }, { note: 'tn1' }]), verse('2', [{ text: 'A paragraph.' }])];
    const notes = [{ id: 'tn1', kind: 'note', text: [{ text: 'A note.' }] } as PageSegment];
    const html = wordsHtml(words, notes, 'פרק א׳', chaptersLayout, tanya, { beside: { segments: english, language: 'en' } });
    expect(html).toContain('<div class="pair"><p data-v="ב" id="s-2">פסקה לדוגמה.</p><p class="tr" id="t-2" lang="en" dir="ltr" data-v="2">A paragraph.</p></div>');
    expect(html).toContain('<a class="nm" href="#n-tn1" data-n="tn1" aria-label="הערה 1">1</a>');
  });

  it('names a chapter in the row by its number, any other page by its name', () => {
    const part = 'חלק ראשון; ליקוטי אמרים';
    expect(chapterLabel(`${part}, פרק נ״א`, part)).toBe('נא');
    expect(chapterLabel(`${part}, הסכמות, פרק ב׳`, part)).toBe('הסכמות');
    expect(chapterLabel(`${part}, הקדמת המלקט`, part)).toBe('הקדמת המלקט');
  });

  it('titles a page without the parts said under it', () => {
    expect(shortTitle('חלק ראשון; ליקוטי אמרים, הקדמת המלקט', 'חלק ראשון; ליקוטי אמרים')).toBe('הקדמת המלקט');
    expect(shortTitle('אורח חיים, מהדורא תניינא, סימן א׳', 'אורח חיים · מהדורא תניינא')).toBe('סימן א׳');
    expect(shortTitle('הקדמת בני המחבר', undefined)).toBe('הקדמת בני המחבר');
  });
});

describe('a siman of Shulchan Aruch HaRav', () => {
  it('numbers each seif in the margin, and sets apart the preface and the name the print sets over the first', () => {
    const first = verse('1', [{ text: 'הקדמה לדוגמה.', marks: ['small'] }, { br: true }, { text: 'דין לדוגמה ובו ב׳ סעיפים:', marks: ['b'] }, { br: true }, { text: 'סעיף לדוגמה (בסוגריים) והמשך.' }]);
    const html = wordsHtml([first, verse('2', [{ text: 'סעיף שני (מילים שקטות).' }])], [], 'סימן א׳', chaptersLayout, siman('מהדורא תניינא'));
    expect(html).toBe(
      '<p id="s-1"><span class="sa-pre"><small>הקדמה לדוגמה.</small></span><span class="sa-name"><b>דין לדוגמה ובו ב׳ סעיפים:</b></span>' +
        '<span class="sa-body" data-seif="א">סעיף לדוגמה <span class="paren">(בסוגריים)</span> והמשך.</span></p>' +
        '<p data-seif="ב" id="s-2">סעיף שני <span class="paren">(מילים שקטות)</span>.</p>',
    );
  });

  it('quiets only words between tags', () => {
    expect(quietParens('<a href="/x(1)">a (b)</a>')).toBe('<a href="/x(1)">a <span class="paren">(b)</span></a>');
  });

  it('gives a siman its count of seifim and a link to its other edition, from the path bar alone', () => {
    const name = (he: string) => ({ he });
    const view = {
      item: { id: 'rh-1', type: 'unit', path: '/sah/2/2', data: siman() },
      pathBar: [
        { kind: 'part', chosen: { path: '/sah/2', name: name('אורח חיים') }, choices: [] },
        {
          kind: 'unit',
          chosen: { path: '/sah/2/2', name: name('אורח חיים, סימן א׳') },
          choices: [
            { path: '/sah/2/1/1', name: name('אורח חיים, מהדורא תניינא, סימן א׳') },
            { path: '/sah/2/1/2', name: name('אורח חיים, מהדורא תניינא, סימן ב׳') },
            { path: '/sah/2/2', name: name('אורח חיים, סימן א׳') },
          ],
        },
      ],
    } as unknown as ItemView;
    expect(simanChips(view, [verse('1', []), verse('2', []), verse('3', [])])).toEqual([{ label: 'ג׳ סעיפים' }, { label: 'מהדורא תניינא', href: '/sah/2/1/1' }]);
  });

  it('gives a chapter of Tanya no chips', () => {
    expect(simanChips({ item: { data: tanya }, pathBar: [] } as unknown as ItemView, [])).toEqual([]);
  });
});
