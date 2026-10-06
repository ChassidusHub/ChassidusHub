import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { themeStylesheet } from '@chassidushub-reader/design';

describe('theme-colors.css', () => {
  it('is the design package\'s stylesheet, unchanged - regenerate it after a color changes there', () => {
    const file = readFileSync(new URL('./theme-colors.css', import.meta.url), 'utf8');
    expect(file.slice(file.indexOf('\n') + 1)).toBe(themeStylesheet());
  });
});
