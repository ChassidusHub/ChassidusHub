import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { isEditing, modeHref } from '../app/lib/editMode.js';
import { undoLast, withOp, withoutOp, type Draft } from '../app/lib/draft.js';
import { ModeSwitch } from '../app/ui/page/ModeSwitch.js';
import { Tray } from '../app/ui/page/Tray.js';
import { PageFrame } from '../app/ui/page/PageFrame.js';

/** The redesign's page frame: every page's two modes at one address, and the tray of your changes. */

const at = (url: string, node: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, node));

describe('edit mode in the address', () => {
  it('is ?edit, and ?edit=0 is Read', () => {
    expect(isEditing('?edit')).toBe(true);
    expect(isEditing('?edit=1')).toBe(true);
    expect(isEditing('?lang=he&edit')).toBe(true);
    expect(isEditing('?edit=0')).toBe(false);
    expect(isEditing('')).toBe(false);
  });

  it('switches mode keeping the rest of the address', () => {
    expect(modeHref('/tanya', '?lang=he&part=1', true)).toBe('/tanya?lang=he&part=1&edit');
    expect(modeHref('/tanya', '?lang=he&edit&part=1', false, '#s-3')).toBe('/tanya?lang=he&part=1#s-3');
    expect(modeHref('/tanya', '', true)).toBe('/tanya?edit');
    expect(modeHref('/tanya', '?edit', false)).toBe('/tanya');
  });
});

describe('a draft', () => {
  const empty: Draft = { place: 'rh-9mf1zxts', ops: [] };
  const rename = { key: 'rh-9mf1zxts:title.en', op: 'set', says: 'Renamed the sefer', value: 'Sefer HaTanya' };

  it('counts things changed: a second change to the same thing replaces the first, in its place', () => {
    const one = withOp(withOp(empty, rename), { key: 'p1', op: 'words', says: 'Fixed a word' });
    const two = withOp(one, { ...rename, value: 'Tanya' });
    expect(two.ops.map((o) => o.key)).toEqual(['rh-9mf1zxts:title.en', 'p1']);
    expect(two.ops[0]?.value).toBe('Tanya');
  });

  it('undoes one change, or the last', () => {
    const d = withOp(withOp(empty, rename), { key: 'p1', op: 'words', says: 'Fixed a word' });
    expect(withoutOp(d, 'rh-9mf1zxts:title.en').ops.map((o) => o.key)).toEqual(['p1']);
    expect(undoLast(d).ops.map((o) => o.key)).toEqual(['rh-9mf1zxts:title.en']);
  });
});

describe('the Read · Edit switch', () => {
  it('marks Read as current on a page, and its Edit link keeps the language', () => {
    const html = at('/tanya?lang=he', createElement(ModeSwitch, { lang: 'he' }));
    expect(html).toContain('aria-label="קריאה או עריכה"');
    const read = html.match(/<a[^>]*href="\/tanya\?lang=he"[^>]*>/)?.[0] ?? '';
    expect(read).toContain('aria-current="page"');
    expect(html).toContain('href="/tanya?lang=he&amp;edit"');
  });

  it('marks Edit as current in Edit', () => {
    const html = at('/tanya?edit', createElement(ModeSwitch, { lang: 'en' }));
    const edit = html.match(/<a[^>]*href="\/tanya\?edit"[^>]*>/)?.[0] ?? '';
    expect(edit).toContain('aria-current="page"');
  });
});

describe('the tray', () => {
  it('is not drawn when nothing changed', () => {
    expect(renderToStaticMarkup(createElement(Tray, { draft: { place: 'x', ops: [] }, lang: 'en', onUndo: () => {}, onSend: () => {} }))).toBe('');
  });

  it('says how many changes and the last one', () => {
    const html = renderToStaticMarkup(
      createElement(Tray, { draft: { place: 'x', ops: [{ key: 'a', op: 'set', says: 'Renamed the sefer' }, { key: 'b', op: 'set', says: 'Fixed a word' }] }, lang: 'en', onUndo: () => {}, onSend: () => {} }),
    );
    expect(html).toContain('>2<');
    expect(html).toContain('Fixed a word');
    expect(html).toContain('Send');
  });
});

describe('the page frame', () => {
  const page = (url: string) =>
    at(url, createElement(PageFrame, { lang: 'en', place: 'rh-9mf1zxts', title: 'Tanya', info: 'History', children: (editing: boolean) => (editing ? 'EDITING' : 'READING') }));

  it('draws the page in Read by default', () => {
    const html = page('/tanya');
    expect(html).toContain('class="page-frame"');
    expect(html).toContain('READING');
    expect(html).not.toContain('pf-edit-hint');
  });

  it('draws the same page in Edit at ?edit, with the hint', () => {
    const html = page('/tanya?edit');
    expect(html).toContain('class="page-frame is-editing"');
    expect(html).toContain('EDITING');
    expect(html).toContain('Tap anything outlined to change it.');
  });
});
