import { describe, expect, it } from 'vitest';
import type { PageSegment } from '@chassidushub/model';
import { daybookLayout, dayParts, shiurPath } from '../app/views/daybook.layout.js';
import { wordsHtml } from '../app/reader/words.server.js';

const p = (id: string, text: string, extra: Partial<PageSegment> = {}): PageSegment => ({ id, kind: 'paragraph', text: [{ text }], ...extra });
const machine = { by: 'ocr:tesseract-heb+claude' };

/** A day of Hayom Yom as /v1/view gives it: its label and month, and its words with what was read off the scan (sample words). */
const day = (label: string, month: string) => ({ label: { he: `<h3>${label}</h3>` }, position: [{ label: { he: `<h2>${month}</h2>` }, level: 'day', value: '1' }, { level: 'unit', value: '1' }] });
const segments = [
  { id: 'lead-h', kind: 'heading', text: [{ text: 'כותרת לדוגמה' }], origin: machine } as PageSegment,
  p('lead-1', 'מכתב לדוגמה.', { origin: machine }),
  p('tanya', 'שורה ראשונה לדוגמה\nשורה שניה לדוגמה', { origin: machine }),
  p('pre-1', 'הודעה לדוגמה.', { origin: machine }),
  p('p1', 'פסקה ראשונה לדוגמה.'),
  p('p2', 'פסקה שניה לדוגמה.'),
];

/** Hayom Yom is set as the book prints it, as the old site set it (PR #104, #105). */
describe('a day of Hayom Yom', () => {
  it('sets the letter, the head row, the notices, the shiurim and then the words, in the print’s order', () => {
    const html = wordsHtml(segments, [], 'יט כסלו', daybookLayout, day('יט כסלו', 'כסלו'));
    const order = ['class="hy-lead"', 'class="hy-head"', 'class="hy-pre"', 'class="hy-shiurim"', 'id="s-p1"'].map((mark) => html.indexOf(mark));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // 19 Kislev 5703 was a Shabbos.
    expect(html).toContain('<div class="hy-head"><span>שבת</span><span>יט כסלו</span><span>ה׳תש״ג</span></div>');
  });

  it('links each shiur to its words on ChassidusHub, the Tanya line as printed', () => {
    const html = wordsHtml(segments, [], 'יט כסלו', daybookLayout, day('יט כסלו', 'כסלו'));
    expect(html).toMatch(/<span class="hy-n">חומש:<\/span><div class="hy-v"><a href="\/chumash\/genesis\/\d+(#s-\d+)?">וישלח, שביעי עם פירש״י.<\/a>/);
    expect(html).toContain('<a href="/tehillim/90">צ-צו.</a>');
    expect(html).toMatch(/<div class="hy-v hy-tanya"><a href="\/tanya\/1\/[^"]+"><p id="s-tanya" class="m">שורה ראשונה לדוגמה\nשורה שניה לדוגמה<\/p><\/a>/);
  });

  it('keeps what was read off the scan marked as a machine’s', () => {
    const html = wordsHtml(segments, [], 'יט כסלו', daybookLayout, day('יט כסלו', 'כסלו'));
    expect(html).toContain('<p id="s-lead-1" class="m">');
    expect(html).toContain('<p id="s-pre-1" class="m">');
    expect(html).toContain('<p id="s-p1">');
  });

  it('never nests a link: a Tanya line with a note mark of its own is left unwrapped', () => {
    const tanya = { id: 'tanya', kind: 'paragraph', text: [{ text: 'שורה לדוגמה' }, { note: 'n1' }], origin: machine } as PageSegment;
    const html = wordsHtml([tanya, p('p1', 'פסקה לדוגמה.')], [p('n1', 'הערה לדוגמה.', { kind: 'note' })], 'יט כסלו', daybookLayout, day('יט כסלו', 'כסלו'));
    expect(html).toMatch(/<div class="hy-v hy-tanya"><p id="s-tanya" class="m">שורה לדוגמה<a class="nm"/);
  });

  it('names the day’s chapter of Tanya when the print’s line is not there', () => {
    const html = wordsHtml([p('p1', 'פסקה לדוגמה.')], [], 'כ כסלו', daybookLayout, day('כ כסלו', 'כסלו'));
    expect(html).toMatch(/<span class="hy-n">תניא:<\/span><div class="hy-v hy-tanya"><a href="\/tanya\/[^"]+"><p>[^<]+\.<\/p><\/a>/);
  });

  it('sets the first paragraphs the print puts above the shiurim, and after them, as notices', () => {
    const parts = dayParts([p('a', '1'), p('b', '2'), p('c', '3'), p('d', '4')], 1, 2);
    expect([parts.pre, parts.after, parts.words].map((list) => list.map((s) => s.id))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('draws a day the calendar does not place as plain words', () => {
    expect(wordsHtml([p('p1', 'פסקה לדוגמה.')], [], 'ל טבת', daybookLayout, day('ל טבת', 'טבת'))).toBe('<p id="s-p1">פסקה לדוגמה.</p>');
  });

  it('places Chumash and Tehillim at the paths Chitas is imported at', () => {
    expect(shiurPath('Genesis 32:4-13')).toBe('/chumash/genesis/32#s-4');
    expect(shiurPath('Exodus 10:1-11')).toBe('/chumash/exodus/10');
    expect(shiurPath('Psalms 119:97-176')).toBe('/tehillim/119#s-97');
    expect(shiurPath('Psalms 23-28')).toBe('/tehillim/23');
    expect(shiurPath('Mishneh Torah, Divorce 9')).toBeNull();
    expect(shiurPath(null)).toBeNull();
  });
});
