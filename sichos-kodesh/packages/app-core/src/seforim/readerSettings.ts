/**
 * How the reader shows a sefer: its type, size and spacing, its paper, and
 * what it shows of the text's apparatus. The same options in both apps; each
 * app keeps them on its own device.
 */

export type ReaderFontId = 'sbl-hebrew' | 'david' | 'frank-ruehl' | 'noto-serif' | 'system';

export interface ReaderFont {
  id: ReaderFontId;
  name: { he: string; en: string };
  /**
   * The font family both apps load: the Android asset name (with `_bold` for
   * its bold face) and the web's @font-face family. Null for the device's own.
   */
  family: string | null;
  /** Whether the family has its own bold face; without one, bold is drawn by the system. */
  bold: boolean;
  /** The licence it is shipped under, for About. */
  licence: string;
  /** Where the font comes from, for About. */
  origin: string;
  /** Where the font and its licence are published. */
  url: string;
}

/** In the order the settings list them. */
export const READER_FONTS: readonly ReaderFont[] = [
  { id: 'frank-ruehl', name: { he: 'פרנק-ריהל', en: 'Frank Ruehl' }, family: 'FrankRuehlCLM', bold: true, licence: 'GPL-2.0 with font exception', origin: 'Culmus Project', url: 'https://culmus.sourceforge.io' },
  { id: 'david', name: { he: 'דוד', en: 'David' }, family: 'DavidCLM', bold: true, licence: 'GPL-2.0 with font exception', origin: 'Culmus Project', url: 'https://culmus.sourceforge.io' },
  { id: 'sbl-hebrew', name: { he: 'SBL עברית', en: 'SBL Hebrew' }, family: 'SBLHebrew', bold: false, licence: 'SBL Font EULA (free, non-commercial)', origin: 'Society of Biblical Literature, Tiro Typeworks', url: 'https://www.sbl-site.org' },
  { id: 'noto-serif', name: { he: 'נוטו סריף', en: 'Noto Serif' }, family: 'NotoSerifHebrew', bold: true, licence: 'SIL Open Font License 1.1', origin: 'The Noto Project', url: 'https://github.com/notofonts/hebrew' },
  { id: 'system', name: { he: 'גופן המכשיר', en: 'Device font' }, family: null, bold: true, licence: '', origin: '', url: '' },
];

export function readerFont(id: ReaderFontId): ReaderFont {
  return READER_FONTS.find((font) => font.id === id) ?? READER_FONTS[0]!;
}

/** `app` follows the app's own light or dark theme. */
export type ReaderTheme = 'app' | 'paper' | 'sepia' | 'night';
export const READER_THEME_IDS: readonly ReaderTheme[] = ['app', 'paper', 'sepia', 'night'];

export interface ReaderPalette {
  background: string;
  text: string;
  muted: string;
  accent: string;
  rule: string;
}

/** The reader's own papers; `app` borrows the app's colours instead. */
export const READER_PALETTES: Readonly<Record<Exclude<ReaderTheme, 'app'>, ReaderPalette>> = {
  paper: { background: '#FBFAF6', text: '#1C1A16', muted: '#77705F', accent: '#1A7F4B', rule: '#E4DFD3' },
  sepia: { background: '#F3E9D2', text: '#3A2E1D', muted: '#7D6A4C', accent: '#8A5A1B', rule: '#E0D1B0' },
  night: { background: '#15140F', text: '#DCD6C8', muted: '#8F887A', accent: '#6DBB8E', rule: '#2E2B24' },
};

export type ReaderSpacing = 'compact' | 'normal' | 'relaxed';
export const READER_SPACINGS: readonly ReaderSpacing[] = ['compact', 'normal', 'relaxed'];
/** Line height as a multiple of the text size. */
export const LINE_HEIGHTS: Readonly<Record<ReaderSpacing, number>> = { compact: 1.45, normal: 1.7, relaxed: 2 };

export type ReaderMargins = 'narrow' | 'normal' | 'wide';
export const READER_MARGINS: readonly ReaderMargins[] = ['narrow', 'normal', 'wide'];
/** Side margins in points on a phone; the web also caps the line length. */
export const MARGIN_POINTS: Readonly<Record<ReaderMargins, number>> = { narrow: 10, normal: 20, wide: 34 };
/** The web's longest line, in characters, per margin setting. */
export const MEASURE_CHARACTERS: Readonly<Record<ReaderMargins, number>> = { narrow: 90, normal: 70, wide: 56 };

/** `end`: numbers that open the note, and the notes after the text. `inline`: each note in the text, small, where it is marked. */
export type ReaderNotes = 'end' | 'inline';

export interface ReaderSettings {
  font: ReaderFontId;
  /** Whether the font was picked in the settings; until it is, a work may open in its own (`readerFontFor`). */
  fontChosen: boolean;
  /** Multiplies the reader's base text size (19 points): 0.8 to 2, in steps of 0.1. */
  scale: number;
  spacing: ReaderSpacing;
  margins: ReaderMargins;
  theme: ReaderTheme;
  /** Show the vowel points (niqqud) and cantillation. */
  niqqud: boolean;
  /** Justify paragraphs to both edges, as a printed sefer is set. */
  justify: boolean;
  notes: ReaderNotes;
  /** Show the page and daily-study markers. */
  marks: boolean;
  /** At the end of a chapter, go on into the next one on the same page. */
  continuous: boolean;
  /** Keep the screen on while the reader is open (the phone). */
  keepAwake: boolean;
}

export const READER_BASE_SIZE = 19;
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 2;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  font: 'frank-ruehl',
  fontChosen: false,
  scale: 1,
  spacing: 'normal',
  margins: 'normal',
  theme: 'app',
  niqqud: true,
  justify: true,
  notes: 'end',
  marks: true,
  continuous: true,
  keepAwake: true,
};

/** A scale kept within its range, on its 0.1 steps. */
export function clampScale(scale: number): number {
  return Math.round(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, scale)) * 10) / 10;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Stored settings read field by field: anything unreadable falls back to its
 * default. `legacyScale` is the text size older versions kept on its own.
 */
export function parseReaderSettings(raw: unknown, legacyScale?: unknown): ReaderSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReaderSettings, unknown>>;
  const d = DEFAULT_READER_SETTINGS;
  const scaleIn = typeof value.scale === 'number' ? value.scale : typeof legacyScale === 'number' ? legacyScale : d.scale;
  return {
    font: oneOf(value.font, READER_FONTS.map((f) => f.id), d.font),
    // A row from before the flag: a font other than the default was chosen.
    fontChosen: flag(value.fontChosen, typeof value.font === 'string' && value.font !== d.font),
    scale: Number.isFinite(scaleIn) && scaleIn >= FONT_SCALE_MIN && scaleIn <= FONT_SCALE_MAX ? clampScale(scaleIn) : d.scale,
    spacing: oneOf(value.spacing, READER_SPACINGS, d.spacing),
    margins: oneOf(value.margins, READER_MARGINS, d.margins),
    theme: oneOf(value.theme, READER_THEME_IDS, d.theme),
    niqqud: flag(value.niqqud, d.niqqud),
    justify: flag(value.justify, d.justify),
    notes: oneOf(value.notes, ['end', 'inline'] as const, d.notes),
    marks: flag(value.marks, d.marks),
    continuous: flag(value.continuous, d.continuous),
    keepAwake: flag(value.keepAwake, d.keepAwake),
  };
}

/**
 * The font a work opens in: the one picked in the settings, or, until one
 * is picked, the work's own - David for the Igros (genre `igros`), the
 * default for everything else.
 */
export function readerFontFor(settings: Pick<ReaderSettings, 'font' | 'fontChosen'>, work: { genre: string } | null | undefined): ReaderFontId {
  if (settings.fontChosen || !work) return settings.font;
  return work.genre === 'igros' ? 'david' : settings.font;
}

/** The text size in points (or CSS pixels) for these settings. */
export function readerTextSize(settings: Pick<ReaderSettings, 'scale'>): number {
  return Math.round(READER_BASE_SIZE * settings.scale);
}

export function readerLineHeight(settings: Pick<ReaderSettings, 'scale' | 'spacing'>): number {
  return Math.round(readerTextSize(settings) * LINE_HEIGHTS[settings.spacing]);
}
