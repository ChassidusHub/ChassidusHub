/**
 * The colors every surface draws with (docs: the UI/UX redo plan, "Visual
 * system"). The neutrals are fixed per scheme: warm, paper-like in light,
 * ink in dark. The accent is the person's choice among the presets below;
 * it marks actions, what is playing and progress, never whole areas.
 *
 * The keys are the phone's (apps/mobile/src/ui/theme.tsx `Colors`); the web
 * and pack.sk read the same values as CSS variables (css.ts).
 */

export type Scheme = 'light' | 'dark';

export interface Neutrals {
  /** The page. */
  bg: string;
  /** Cards, sheets, the tab bar. */
  bgElevated: string;
  /** Everything read. */
  fg: string;
  /** Dates, counts, second lines. */
  muted: string;
  /** Dividers and borders. */
  border: string;
  /** A quiet filled surface: a row's well, an unselected chip. */
  cardBg: string;
  /** cardBg under the pointer or finger. */
  cardHover: string;
  /** Failures only. */
  danger: string;
  /** Text on danger. */
  dangerFg: string;
  /** "New this week", updates. */
  newMark: string;
}

export interface AccentColors {
  /** Primary buttons, playing, progress, downloaded. */
  accent: string;
  /** Text and icons on a filled accent. */
  accentFg: string;
  /** Selected chips, the this-week card: a tint that text reads on. */
  accentSoft: string;
}

export type Colors = Neutrals & AccentColors;

export const NEUTRALS: Record<Scheme, Neutrals> = {
  light: {
    bg: '#faf8f4',
    bgElevated: '#ffffff',
    fg: '#161816',
    muted: '#5d6660',
    border: '#e4e1da',
    cardBg: '#f2efe9',
    cardHover: '#e9e5dd',
    danger: '#b3261e',
    dangerFg: '#ffffff',
    newMark: '#9a5b00',
  },
  dark: {
    bg: '#0e1110',
    bgElevated: '#161a18',
    fg: '#eef1ee',
    muted: '#9aa39d',
    border: '#262b28',
    cardBg: '#1a1f1c',
    cardHover: '#232925',
    danger: '#f2b8b5',
    dangerFg: '#1a1a1a',
    newMark: '#f0a53a',
  },
};

export type AccentPresetId = 'green' | 'blue' | 'burgundy' | 'teal' | 'gold' | 'purple';

export interface AccentPreset {
  id: AccentPresetId;
  name: { he: string; en: string };
  light: AccentColors;
  dark: AccentColors;
}

/** The theme colors people choose from, in the order Settings lists them. Green, the app's own since its first version, is the default. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  {
    id: 'green',
    name: { he: 'ירוק', en: 'Green' },
    light: { accent: '#16744a', accentFg: '#ffffff', accentSoft: '#e3f1e8' },
    dark: { accent: '#3ccf7a', accentFg: '#0e1110', accentSoft: '#173a27' },
  },
  {
    id: 'blue',
    name: { he: 'כחול', en: 'Blue' },
    light: { accent: '#23466e', accentFg: '#ffffff', accentSoft: '#e3eaf3' },
    dark: { accent: '#8fb4e3', accentFg: '#0e1110', accentSoft: '#1b2a3d' },
  },
  {
    id: 'burgundy',
    name: { he: 'בורדו', en: 'Burgundy' },
    light: { accent: '#8c2a3c', accentFg: '#ffffff', accentSoft: '#f5e4e7' },
    dark: { accent: '#e58a9b', accentFg: '#0e1110', accentSoft: '#3a1c22' },
  },
  {
    id: 'teal',
    name: { he: 'טורקיז', en: 'Teal' },
    light: { accent: '#0f6e6e', accentFg: '#ffffff', accentSoft: '#dff0ef' },
    dark: { accent: '#4fc9c3', accentFg: '#0e1110', accentSoft: '#133634' },
  },
  {
    id: 'gold',
    name: { he: 'זהב', en: 'Gold' },
    light: { accent: '#7e5800', accentFg: '#ffffff', accentSoft: '#f6ecd5' },
    dark: { accent: '#e5b64a', accentFg: '#0e1110', accentSoft: '#3a2e12' },
  },
  {
    id: 'purple',
    name: { he: 'סגול', en: 'Purple' },
    light: { accent: '#5b3f99', accentFg: '#ffffff', accentSoft: '#ebe5f5' },
    dark: { accent: '#b49ae8', accentFg: '#0e1110', accentSoft: '#2a2240' },
  },
];

export const DEFAULT_ACCENT: AccentPresetId = 'green';

/** A preset by id; an unknown id (a setting saved by a later version) falls back to the default. */
export function accentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT)!;
}

/** Every color of one scheme with one theme color. */
export function themeColors(scheme: Scheme, accentId?: string | null): Colors {
  return { ...NEUTRALS[scheme], ...accentPreset(accentId)[scheme] };
}
