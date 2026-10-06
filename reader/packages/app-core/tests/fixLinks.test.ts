import { describe, expect, it } from 'vitest';
import { fixLinkUrl } from '../src/feedback/fixLinks.js';

describe('fixLinkUrl', () => {
  it("names the item by the app's own ids", () => {
    expect(fixLinkUrl('edit', { farbrengen: 11116164 })).toBe('https://chassidushub.org/_/app/edit?farbrengen=11116164');
    expect(fixLinkUrl('report', { work: 'igros-kodesh-rebbe', unit: '12' })).toBe('https://chassidushub.org/_/app/report?work=igros-kodesh-rebbe&unit=12');
    expect(fixLinkUrl('edit', { work: 'tanya' })).toBe('https://chassidushub.org/_/app/edit?work=tanya');
  });

  it('carries the version and platform of the app', () => {
    expect(fixLinkUrl('report', { app: true }, { version: '3.0.0', platform: 'android' })).toBe('https://chassidushub.org/_/app/report?v=3.0.0&on=android');
  });
});
