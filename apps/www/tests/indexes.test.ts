import { describe, expect, it } from 'vitest';
import type { PageSegment } from '@chassidushub/model';
import { indexLayout, isIndexWords } from '../app/views/index.layout.js';
import { wordsHtml } from '../app/reader/words.server.js';

const read = (page: number, sicha: string, drive = '10lgqHuWolYlpIcJ5IeiANHxPOXYtDTy2') =>
  `/read?page=5&title=${encodeURIComponent(sicha).replace(/%20/g, '+')}&src=https://drive.google.com/open?id=${drive}`;

/** Likkutei Sichos vol. 30's subject index as /v1/view gives its words (shortened). */
const volume30: PageSegment[] = [
  { id: 't1', kind: 'heading', level: 2, text: [{ text: 'אב ואם' }] },
  {
    id: 't1.1',
    kind: 'paragraph',
    text: [{ href: read(240, 'ח"ל ע\' 236 (ויחי א)'), text: '240' }, { text: ' (הטעם שבעצם ענין של ישראל הולכים אחרי האם).\r\nע"ע כיבוד אב ואם, אבות' }, { text: '.' }],
  },
  { id: 't3', kind: 'heading', level: 2, text: [{ text: 'אבות' }] },
  { id: 't3.1', kind: 'paragraph', text: [{ href: read(38, 'ח"ל ע\' 36 (לך לך א)'), text: '38' }, { text: ' (מעשה אבות סימן לבנים)' }, { text: '.' }, { text: ' 1167' }, { text: '.' }] },
  { id: 't9', kind: 'heading', level: 2, text: [{ text: 'בהמה' }], origin: { by: 'ocr:kraken' } },
  { id: 't9.1', kind: 'paragraph', text: [{ href: read(12, 'ח"ל ע\' 1 (בראשית א)'), text: '12' }] },
];

/** The merged index, one letter a page: each volume a paragraph led by its name in bold. */
const merged: PageSegment[] = [
  { id: 't2', kind: 'heading', level: 2, text: [{ text: 'אהבה ויראה' }] },
  { id: 't2.15', kind: 'paragraph', text: [{ text: 'חלק טו', marks: ['b'] }, { text: ': ' }, { href: read(1, 'חט"ו ע\' 1 (בראשית א)'), text: '1' }, { text: '.' }] },
  { id: 't2.30', kind: 'paragraph', text: [{ text: 'חלק ל', marks: ['b'] }, { text: ': ' }, { href: read(104, 'ח"ל ע\' 103 (תולדות א)'), text: '104' }, { text: ' (התכללותם).' }] },
  { id: 't4', kind: 'heading', level: 2, text: [{ text: 'אור' }] },
  { id: 't4.30', kind: 'paragraph', text: [{ text: 'חלק ל', marks: ['b'] }, { text: ': ' }, { href: read(14, 'ח"ל ע\' 1 (בראשית א)'), text: '14' }] },
];

const draw = (segments: PageSegment[], around = {}) => wordsHtml(segments, [], 'חלק ל', indexLayout, {}, around);

describe('an index read as printed', () => {
  it('knows an index by its words, and never a sicha', () => {
    expect(isIndexWords(volume30)).toBe(true);
    expect(isIndexWords(merged)).toBe(true);
    const sicha: PageSegment[] = [
      { id: 'a', kind: 'heading', text: [{ text: 'א' }] },
      { id: 'b', kind: 'paragraph', text: [{ text: 'בפרשתנו מסופר' }] },
      { id: 'c', kind: 'heading', text: [{ text: 'ב' }] },
      { id: 'd', kind: 'paragraph', text: [{ text: 'ראה לקו"ש ח"ל ע\' ' }, { text: '240', href: '/likkutei-sichos/30' }] },
    ];
    expect(isIndexWords(sicha)).toBe(false);
  });

  it('sets each entry: its heading in bold, then its pages, each segment its own element', () => {
    const html = draw(volume30, { volume: 30 });
    expect(html).toContain('<div class="ix-e" data-l="א"><p id="s-t1" class="ix-h">אב ואם</p><p id="s-t1.1" class="ix-p">');
    expect(html).toContain('<p id="s-t9" class="ix-h m">בהמה</p>');
  });

  it('makes each linked page a reference to its sicha, opening its PDF without script', () => {
    const html = draw(volume30, { volume: 30 });
    expect(html).toContain(
      `<a class="ref" href="https://drive.google.com/file/d/10lgqHuWolYlpIcJ5IeiANHxPOXYtDTy2/view" rel="noopener" target="_blank" data-p="240" data-v="30" data-s="ח&quot;ל ע' 236 (ויחי א)">240</a>`,
    );
    // A page number the index does not link stays plain.
    expect(html).toContain('. 1167.');
  });

  it('keeps the words of every run, so a fix counts them as drawn', () => {
    const text = (html: string) => html.replace(/<nav.*?<\/nav>/, '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"');
    const words = (segments: PageSegment[]) => segments.map((s) => (s.text ?? []).map((r) => ('text' in r ? r.text : '')).join('')).join('');
    expect(text(draw(volume30, { volume: 30 }))).toBe(words(volume30));
  });

  it('jumps from ע"ע to the entry on this page, and leaves a name it lacks as it is', () => {
    const html = draw(volume30, { volume: 30 });
    expect(html).toContain('ע&quot;ע כיבוד אב ואם, <a class="see" href="#s-t3">אבות</a>.');
  });

  it('puts the letters on top, each jumping to its first entry', () => {
    const html = draw(volume30, { volume: 30 });
    expect(html.startsWith('<nav class="ix-ab" aria-label="לפי אות"><a href="#s-t1">א</a><a href="#s-t9">ב</a><span aria-hidden="true">ג</span>')).toBe(true);
  });

  it('names each page of the merged index with its volume, each volume on its own line', () => {
    const html = draw(merged, {});
    expect(html).toContain('<p id="s-t2.15" class="ix-v"><b>חלק טו</b>: <a class="ref"');
    expect(html).toMatch(/data-p="1" data-v="15"/);
    expect(html).toMatch(/data-p="104" data-v="30"/);
  });

  it('opens the merged index’s other letters, one a page, from its letters', () => {
    const siblings = [
      { path: '/likkutei-sichos-mafteach-klali/1', label: 'אות א', current: true },
      { path: '/likkutei-sichos-mafteach-klali/2', label: 'אות ב', current: false },
    ];
    const html = draw(merged.slice(0, 3), { siblings });
    expect(html).toContain('<nav class="ix-ab" aria-label="לפי אות"><a href="/likkutei-sichos-mafteach-klali/1" aria-current="page">א</a><a href="/likkutei-sichos-mafteach-klali/2">ב</a></nav>');
  });
});
