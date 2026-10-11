import { describe, expect, it } from 'vitest';
import type { PageSegment } from '@chassidushub/model';
import { notesHtml, wordsHtml } from '../app/reader/words.server.js';

const p = (id: string, text: PageSegment['text'], extra: Partial<PageSegment> = {}): PageSegment => ({ id, kind: 'paragraph', text, ...extra });

describe('the reader draws words as HTML', () => {
  it('escapes every word, so nothing in the words is ever read as markup', () => {
    const html = wordsHtml([p('p1', [{ text: '<script>alert("x")</script> & "ok"' }])], [], '');
    expect(html).toBe('<p id="s-p1">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;ok&quot;</p>');
  });

  it('writes the marks, the ois, links to the web and footnote marks', () => {
    const html = wordsHtml(
      [p('p1', [{ text: 'א.', marks: ['ois'] }, { text: ' מילה', marks: ['b'] }, { note: 'n1' }, { text: 'קישור', href: 'https://example.org' }, { text: 'פנימי', href: 'rh-abcdefgh' }])],
      [{ id: 'n1', kind: 'note', label: '*', text: [{ text: 'הערה' }] }],
      '',
    );
    expect(html).toContain('<span class="ois">א.</span>');
    expect(html).toContain('<b> מילה</b>');
    expect(html).toContain('<a class="nm" href="#n-n1" data-n="n1" aria-label="הערה *">*</a>');
    expect(html).toContain('<a href="https://example.org" rel="noopener" target="_blank">קישור</a>');
    // An item's id is not a place to link to from the words.
    expect(html).toContain('פנימי');
    expect(html).not.toContain('href="rh-');
  });

  it('marks words a machine read until a person checks them', () => {
    const origin = { by: 'ocr', checked: false } as unknown as PageSegment['origin'];
    const checked = { by: 'ocr', checked: true } as unknown as PageSegment['origin'];
    const html = wordsHtml([p('a', [{ text: 'מכונה' }], { origin }), p('b', [{ text: 'נבדק' }], { origin: checked })], [], '');
    expect(html).toBe('<p id="s-a" class="m">מכונה</p><p id="s-b">נבדק</p>');
  });

  it('hides the first heading only when it repeats the page title', () => {
    const heading = (text: string): PageSegment => ({ id: 'h', kind: 'heading', text: [{ text }] });
    expect(wordsHtml([heading('ש מ י נ י')], [], 'שמיני')).toContain('class="hd first"');
    expect(wordsHtml([heading('פתיחה')], [], 'שמיני')).toBe('<p id="s-h" class="hd">פתיחה</p>');
  });

  it('draws sections with their segments, and leaves out a printed line’s end', () => {
    const html = wordsHtml([{ id: 's', kind: 'section', text: [{ text: 'פרק' }], children: [p('p', [{ text: 'שורה' }, { eol: 'line' }, { text: ' הבאה' }])] }], [], '');
    expect(html).toBe('<p class="hd" id="s-s">פרק</p><p id="s-p">שורה הבאה</p>');
  });

  it('numbers the notes as the source does, else by their place', () => {
    const html = notesHtml([
      { id: 'a', kind: 'note', n: 7, text: [{ text: 'שבע' }] },
      { id: 'b', kind: 'note', text: [{ text: 'בלי מספר' }] },
    ]);
    expect(html).toBe('<li id="n-a" class="fn"><span class="fl">7</span><span class="nt">שבע</span></li><li id="n-b" class="fn"><span class="fl">2</span><span class="nt">בלי מספר</span></li>');
  });
});
