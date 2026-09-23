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

export function marginStart(isRtl: boolean, value: number): ViewStyle {
  return isRtl ? { marginRight: value } : { marginLeft: value };
}

export function marginEnd(isRtl: boolean, value: number): ViewStyle {
  return isRtl ? { marginLeft: value } : { marginRight: value };
}

export function alignStart(isRtl: boolean): ViewStyle['alignSelf'] {
  return isRtl ? 'flex-end' : 'flex-start';
}
