const HEBREW_LETTER = 'א-ת';

/**
 * Reported, reproduced bug: Android's media-notification renderer garbles
 * an RTL string at the first ASCII quote it hits - e.g. the occasion label
 * "ליל אדר\"ח אד\"ש" showed up in the notification's subtitle as just
 * "ליל ]", with the rest of the line silently dropped, even though the
 * exact same string renders correctly everywhere else in the app (Chrome's
 * own text layout handles it fine; Android's system notification text view
 * does not). Straight ASCII quotes (U+0022/U+0027) have an ambiguous
 * "Other Neutral" bidi class, unlike Hebrew's own dedicated abbreviation
 * punctuation - gershayim (U+05F4, ״) and geresh (U+05F3, ׳) - which are
 * unambiguously Hebrew/RTL. The crawled source data uses the ASCII
 * characters as a plain-text stand-in for those (אדר"ח, ו'), a real,
 * deliberate convention, not a typo - swap them for the proper Hebrew
 * punctuation only for the notification's own strings, since that's the
 * one place this has actually been seen to break.
 */
export function forMediaSession(text: string): string {
  return text
    .replace(new RegExp(`([${HEBREW_LETTER}])"([${HEBREW_LETTER}])`, 'g'), '$1״$2')
    .replace(new RegExp(`([${HEBREW_LETTER}])'`, 'g'), '$1׳');
}
