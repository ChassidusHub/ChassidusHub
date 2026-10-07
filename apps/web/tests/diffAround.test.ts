import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { suggestionSentence } from '../app/lib/suggestionSentence.js';
import { BeforeAfter, DiffSegment } from '../app/ui/Diff.js';

/**
 * A suggestion shows only what changed, with four words around it, until
 * the paragraph is asked for (design/system, board 22).
 */

const before = 'one two three four five six seven eight nine ten eleven twelve';
const after = before.replace('seven', 'SEVEN');

describe('only what changed', () => {
  it('draws a changed passage as the changed words and four on each side', () => {
    const html = renderToStaticMarkup(createElement(DiffSegment, { before, after, around: true }));
    expect(html).toContain('… three four five six ');
    expect(html).toContain('<del>seven</del><ins>SEVEN</ins>');
    expect(html).toContain(' eight nine ten eleven …');
    expect(html).not.toContain('one two');
  });

  it('draws the whole paragraph when asked', () => {
    const html = renderToStaticMarkup(createElement(DiffSegment, { before, after }));
    expect(html).toContain('one two three');
    expect(html).not.toContain('…');
  });

  it('cuts the before and the after alike', () => {
    const html = renderToStaticMarkup(createElement(BeforeAfter, { before, after, lang: 'en', around: true }));
    expect(html.match(/… three four five six /g)).toHaveLength(2);
    expect(html).not.toContain('twelve');
  });
});

describe('a suggestion said in a sentence', () => {
  const fix = (before: string, after: string, reported = false) => ({ segment: { before, after }, transcript: { reported } });
  const where = { label: 'פסקה 3', within: '[שיעור]' };

  it('says what a transcript fix did, in place of the title the site gave it', () => {
    const view = { title: 'תיקון תמלול', where, entries: [fix('אחת שתיים שלוש', 'אחת שתים שלוש'), fix('ארבע חמש', 'ארבע חמש שש'), fix('שבע', 'שבע', true)] };
    expect(suggestionSentence(view, 'he')).toBe('תמלול [שיעור]: 2 מילים תוקנו, פסקה אחת נבדקה');
    expect(suggestionSentence(view, 'en')).toBe('Transcript [שיעור]: 2 words fixed, 1 paragraph checked');
  });

  it('keeps a title a person wrote', () => {
    expect(suggestionSentence({ title: 'Fixed the names in the first sicha', where, entries: [fix('א', 'ב')] }, 'en')).toBe('Fixed the names in the first sicha');
  });

  it('keeps the title of anything that is not all transcript fixes', () => {
    expect(suggestionSentence({ title: 'תיקון תמלול', where, entries: [{ segment: { before: 'א', after: 'ב' }, transcript: null }] }, 'he')).toBe('תיקון תמלול');
  });
});
