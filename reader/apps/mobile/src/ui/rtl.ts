import type { TextStyle, ViewStyle } from 'react-native';

/**
 * The mobile app lays Hebrew mode out by hand (`flexDirection`/`textAlign`
 * flipped per `isRtl`) rather than through React Native's I18nManager,
 * whose forceRTL only takes effect on the next app launch and would leave
 * the first launch after a language switch half-mirrored. Every shared
 * primitive routes its direction-dependent styles through these helpers.
 */
export function row(isRtl: boolean): ViewStyle['flexDirection'] {
  return isRtl ? 'row-reverse' : 'row';
}

export function textAlign(isRtl: boolean): TextStyle['textAlign'] {
  return isRtl ? 'right' : 'left';
}

/**
 * Which way typed text runs, by its first letter - Hebrew right to left,
 * Latin left to right, like the web's `dir="auto"`. A box with no letters
 * in it yet keeps the interface's direction, so a Hebrew placeholder
 * isn't set left to right.
 */
export function typedIsRtl(text: string, isRtl: boolean): boolean {
  const first = /[\u0590-\u05FF\uFB1D-\uFB4FA-Za-z\u00C0-\u024F]/.exec(text);
  return first ? /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(first[0]) : isRtl;
}

export function marginStart(isRtl: boolean, value: number): ViewStyle {
  return isRtl ? { marginRight: value } : { marginLeft: value };
}

export function marginEnd(isRtl: boolean, value: number): ViewStyle {
  return isRtl ? { marginLeft: value } : { marginRight: value };
}

export function alignStart(isRtl: boolean): ViewStyle['alignSelf'] {
  return isRtl ? 'flex-end' : 'flex-start';
}
