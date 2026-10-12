import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, pickView, type ReaderView } from '../app/reader/view.js';

/** The reader's views, one per kind of sefer (docs/rfc/0004-view-kinds.md, app/reader/views.ts). */
describe('the reader’s views', () => {
  const views: ReaderView[] = [{ kind: 'sichos', levels: ['sicha', 'maamar'] }, { kind: 'letters', levels: ['letter'] }, { kind: 'chapters' }];

  it('draws a page with the view its sefer names', () => {
    expect(pickView(views, { view: 'chapters', level: 'letter' }).kind).toBe('chapters');
  });

  it('picks by the unit’s own level when its sefer names none, or names one not built yet', () => {
    expect(pickView(views, { level: 'letter' }).kind).toBe('letters');
    expect(pickView(views, { view: 'siddur', level: 'letter' }).kind).toBe('letters');
  });

  it('falls back to the sichos view', () => {
    expect(pickView(views, {}).kind).toBe(DEFAULT_VIEW);
    expect(pickView(views, { view: 'siddur', level: 'tefila' }).kind).toBe(DEFAULT_VIEW);
    expect(() => pickView([{ kind: 'letters' }], {})).toThrow();
  });

  it('has the sichos view, and every view file names its own kind', () => {
    const dir = new URL('../app/views/', import.meta.url);
    const files = readdirSync(dir).filter((file) => file.endsWith('.tsx'));
    expect(files).toContain(`${DEFAULT_VIEW}.tsx`);
    for (const file of files) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).toMatch(new RegExp(`export const view: ReaderView = \\{\\s*kind: '${file.slice(0, -4)}'`));
    }
  });
});
