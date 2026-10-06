import type { Colors, Scheme } from './colors.js';
import { ACCENT_PRESETS, DEFAULT_ACCENT, NEUTRALS, themeColors } from './colors.js';

/**
 * The colors as CSS custom properties, for the web app and pack.sk. The
 * names are the web's (--bg, --bg-elevated, --accent-fg...): each key in
 * kebab case, and newMark as --new.
 *
 * A page follows the system scheme unless `data-theme` on the root says
 * otherwise, and takes the default theme color unless `data-accent` names
 * another preset.
 */

const VARIABLE: Record<keyof Colors, string> = {
  bg: '--bg',
  bgElevated: '--bg-elevated',
  fg: '--fg',
  muted: '--muted',
  border: '--border',
  cardBg: '--card-bg',
  cardHover: '--card-hover',
  danger: '--danger',
  dangerFg: '--danger-fg',
  newMark: '--new',
  accent: '--accent',
  accentFg: '--accent-fg',
  accentSoft: '--accent-soft',
};

/** `--bg: #faf8f4;` lines for some colors. */
export function cssDeclarations(colors: Partial<Colors>, indent = '  '): string {
  return (Object.keys(VARIABLE) as Array<keyof Colors>)
    .filter((key) => colors[key] !== undefined)
    .map((key) => `${indent}${VARIABLE[key]}: ${colors[key]};`)
    .join('\n');
}

function rule(selector: string, body: string): string {
  return `${selector} {\n${body}\n}`;
}

/** A dark-scheme block twice: under the system's dark preference (unless the page is set to light), and under an explicit `data-theme="dark"`. */
function darkRules(followsSystem: string, explicit: string, colors: Partial<Colors>): string[] {
  return [`@media (prefers-color-scheme: dark) {
  ${followsSystem} {
${cssDeclarations(colors, '    ')}
  }
}`, rule(explicit, cssDeclarations(colors))];
}

/** The whole color stylesheet: light by default, dark by the system or `data-theme="dark"`, and each theme color by `data-accent`. */
export function themeStylesheet(): string {
  const out: string[] = [];
  const base = (scheme: Scheme) => themeColors(scheme, DEFAULT_ACCENT);
  out.push(rule(':root', cssDeclarations(base('light'))));
  out.push(...darkRules(":root:not([data-theme='light'])", ":root[data-theme='dark']", base('dark')));
  for (const preset of ACCENT_PRESETS) {
    if (preset.id === DEFAULT_ACCENT) continue;
    out.push(rule(`:root[data-accent='${preset.id}']`, cssDeclarations(preset.light)));
    out.push(...darkRules(`:root[data-accent='${preset.id}']:not([data-theme='light'])`, `:root[data-theme='dark'][data-accent='${preset.id}']`, preset.dark));
  }
  return `${out.join('\n\n')}\n`;
}

/** The neutrals alone, for a surface that has no theme color of its own. */
export function neutralDeclarations(scheme: Scheme): string {
  return cssDeclarations(NEUTRALS[scheme]);
}
