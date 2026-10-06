/** The shared scales: type, spacing, corners and motion. Numbers are points on the phone and pixels on the web. */

export const FONTS = {
  /** Page titles, the parsha name, sefer names: Hebrew and Latin in one face. */
  display: "'Frank Ruhl Libre', 'FrankRuehlCLM', serif",
  /** The interface. */
  ui: "'Noto Sans Hebrew', 'Noto Sans', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
} as const;

/** The type scale; nothing is set outside it. */
export const TYPE = { title: 28, heading: 22, subheading: 18, body: 16, small: 14, caption: 12 } as const;

/** Steps of 4. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const RADIUS = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

/** Durations in milliseconds; nothing decorative, and none at all when reduced motion is asked for. */
export const MOTION = { fast: 150, base: 200 } as const;

/** The smallest touch target, in points. */
export const TOUCH_TARGET = 48;
