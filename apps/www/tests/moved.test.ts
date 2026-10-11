import { describe, expect, it } from 'vitest';
import { movedTo } from '../app/routes/moved.js';

describe("the old site's addresses", () => {
  it('go to the nearest page here', () => {
    expect(movedTo('/sets')).toBe('/library');
    expect(movedTo('/read')).toBe('/library');
    expect(movedTo('/help')).toBe('/about');
    expect(movedTo('/contribute')).toBe('/about');
    expect(movedTo('/check')).toBe('/back');
    expect(movedTo('/account/tokens')).toBe('/account');
    expect(movedTo('/daily/2026-09-30')).toBe('/');
    expect(movedTo('/shiurim')).toBe('/');
  });

  it('keep a calendar year as a listening year', () => {
    expect(movedTo('/calendar/5742/3')).toBe('/listen/5742');
    expect(movedTo('/calendar')).toBe('/listen');
    expect(movedTo('/calendar/x')).toBe('/listen');
  });
});
