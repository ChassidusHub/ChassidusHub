import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PageText } from '@chassidushub/model';
import type { DraftOp } from '../app/lib/draft.js';
import { PageWords, type DraftWords } from '../app/components/PageWords.js';

/**
 * A text page in Edit (redesign step 3): its words drawn as the person's
 * draft has them, yours in blue until sent, and "Right" on a machine's
 * words nobody has checked. The words are invented for the test.
 */

const PAGE: PageText = {
  profile: 'sichos-kodesh',
  versions: [
    {
      id: 'he',
      language: 'he',
      segments: [
        { id: '1', kind: 'paragraph', text: [{ text: 'פסקה ראשונה' }] },
        { id: '2', kind: 'paragraph', text: [{ text: 'פסקה שניה' }], origin: { by: 'ocr', checked: false } },
        { id: '3', kind: 'paragraph', text: [{ text: 'פסקה שלישית' }] },
      ],
    },
  ],
} as PageText;

const ITEM = 'rh-9mf1zxts';
const draftOf = (ops: DraftOp[]): DraftWords => ({ get: (key) => ops.find((o) => o.key === key), put: () => {}, remove: () => {} });
const draw = (ops: DraftOp[]) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PageWords, { page: PAGE, lang: 'en', edit: { entityId: ITEM, draft: draftOf(ops) } })));

describe('a text page in Edit', () => {
  it('makes every segment tappable and offers Right only on unchecked machine words', () => {
    const html = draw([]);
    expect(html.match(/class="words-editable"/g)).toHaveLength(3);
    expect(html.match(/words-right/g)).toHaveLength(1);
    expect(html).not.toContain('is-mine');
  });

  it("shows the draft's words in place of the page's, marked as yours, with Undo", () => {
    const html = draw([{ key: `words:${ITEM}:he/1`, op: 'words', says: 'Fixed', item: ITEM, change: 'edit', version: 'he', segment: '1', text: [{ text: 'פסקה מתוקנת' }], before: [{ text: 'פסקה ראשונה' }] }]);
    expect(html).toContain('פסקה מתוקנת');
    expect(html).not.toContain('פסקה ראשונה');
    expect(html).toContain('words-editable is-mine');
    expect(html).toContain('Undo');
  });

  it('strikes out a segment taken out, shows one marked right, and one added after', () => {
    const html = draw([
      { key: `words:${ITEM}:he/3`, op: 'words', says: 'Took out', item: ITEM, change: 'remove', version: 'he', segment: '3', before: [{ text: 'פסקה שלישית' }] },
      { key: `words:${ITEM}:he/2`, op: 'words', says: 'Checked', item: ITEM, change: 'check', version: 'he', segment: '2', before: [{ text: 'פסקה שניה' }] },
      { key: `words:${ITEM}:he/1:add`, op: 'words', says: 'Added', item: ITEM, change: 'add', version: 'he', segment: '1', text: [{ text: 'פסקה חדשה' }], before: [{ text: 'פסקה ראשונה' }] },
    ]);
    expect(html).toMatch(/<del class="words-removed">פסקה שלישית<\/del>/);
    expect(html).toContain('You marked it right');
    expect(html).not.toContain('words-right');
    expect(html).toMatch(/words-added is-mine">פסקה חדשה/);
  });
});
