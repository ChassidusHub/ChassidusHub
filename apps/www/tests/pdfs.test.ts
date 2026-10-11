import { describe, expect, it } from 'vitest';
import { pdfsOf } from '../app/lib/pdfs.js';

describe('a page’s PDFs', () => {
  it('puts the printing of the page before a translation, and shows Drive files in its viewer', () => {
    const pdfs = pdfsOf({
      editions: [
        { kind: 'pdf', role: 'translated', label: 'תרגום', url: 'https://drive.google.com/file/d/b/view' },
        { kind: 'text', url: 'https://example.org/words' },
        { kind: 'pdf', role: 'sicha', label: 'drive', url: 'https://drive.google.com/file/d/a/view' },
        { kind: 'pdf', url: 'https://example.org/a.pdf' },
        { kind: 'pdf', url: 'javascript:alert(1)' },
      ],
    });
    expect(pdfs).toEqual([
      { label: 'הדף כפי שנדפס', url: 'https://drive.google.com/file/d/a/view', embed: 'https://drive.google.com/file/d/a/preview' },
      { label: 'הדף כפי שנדפס', url: 'https://example.org/a.pdf', embed: null },
      { label: 'תרגום', url: 'https://drive.google.com/file/d/b/view', embed: 'https://drive.google.com/file/d/b/preview' },
    ]);
  });

  it('is empty for a page with no editions', () => {
    expect(pdfsOf({})).toEqual([]);
    expect(pdfsOf(null)).toEqual([]);
  });
});
