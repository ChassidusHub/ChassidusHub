import { describe, expect, it } from 'vitest';
import { ACCENT_PRESETS, DEFAULT_ACCENT, NEUTRALS, accentPreset, contrast, cssDeclarations, themeColors, themeStylesheet } from '../src/index.js';
import type { Scheme } from '../src/index.js';

const SCHEMES: Scheme[] = ['light', 'dark'];

describe('the neutrals', () => {
  for (const scheme of SCHEMES) {
    it(`read in ${scheme}`, () => {
      const n = NEUTRALS[scheme];
      expect(contrast(n.fg, n.bg)).toBeGreaterThanOrEqual(12);
      for (const ground of [n.bg, n.bgElevated, n.cardBg]) expect(contrast(n.muted, ground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(n.dangerFg, n.danger)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(n.danger, n.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(n.newMark, n.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the theme color presets', () => {
  it('have unique ids, Hebrew and English names, and the ChassidusHub red as the default', () => {
    expect(new Set(ACCENT_PRESETS.map((p) => p.id)).size).toBe(ACCENT_PRESETS.length);
    expect(ACCENT_PRESETS.every((p) => p.name.he && p.name.en)).toBe(true);
    expect(DEFAULT_ACCENT).toBe('chassidushub');
    expect(accentPreset('no-such-color').id).toBe('chassidushub');
    expect(accentPreset(null).id).toBe('chassidushub');
  });

  for (const preset of ACCENT_PRESETS) {
    for (const scheme of SCHEMES) {
      it(`${preset.id} stays readable in ${scheme}`, () => {
        const c = themeColors(scheme, preset.id);
        // The accent as text and icons on the page, on cards and on its own tint.
        for (const ground of [c.bg, c.bgElevated, c.accentSoft]) expect(contrast(c.accent, ground)).toBeGreaterThanOrEqual(4.5);
        // Words on a filled accent, and ordinary text on the tint.
        expect(contrast(c.accentFg, c.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(c.fg, c.accentSoft)).toBeGreaterThanOrEqual(7);
      });
    }
  }
});

describe('the stylesheet', () => {
  const css = themeStylesheet();

  it('sets every variable for the default, and each other preset by data-accent in both schemes', () => {
    expect(css.startsWith(':root {\n  --bg: #faf8f4;')).toBe(true);
    for (const variable of ['--bg-elevated', '--card-hover', '--new', '--accent-fg', '--accent-soft']) expect(css).toContain(`${variable}:`);
    for (const preset of ACCENT_PRESETS.filter((p) => p.id !== DEFAULT_ACCENT)) {
      expect(css).toContain(`:root[data-accent='${preset.id}'] {\n  --accent: ${preset.light.accent};`);
      expect(css).toContain(`:root[data-theme='dark'][data-accent='${preset.id}'] {\n  --accent: ${preset.dark.accent};`);
      expect(css).toContain(`:root[data-accent='${preset.id}']:not([data-theme='light']) {\n    --accent: ${preset.dark.accent};`);
    }
    expect(css.split('{').length).toBe(css.split('}').length);
  });

  it('writes only the colors it is given', () => {
    expect(cssDeclarations({ accent: '#123456' })).toBe('  --accent: #123456;');
  });
});
