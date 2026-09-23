import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { TextProps } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { FONT_FAMILY, useColors } from './theme';
import { textAlign } from './rtl';

/**
 * Every piece of text in the app goes through here so it renders in the
 * bundled Noto Sans face (see FONT_FAMILY) in the current theme's
 * foreground color, aligned to the reading-start side - the same three
 * things `body` sets once for the whole web app. Pass `style` to override
 * any of them, exactly like a CSS class would.
 */
export function AppText({ style, ...rest }: TextProps) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  return <Text {...rest} style={[styles.base, { color: colors.fg, textAlign: textAlign(isRtl) }, style]} />;
}

const styles = StyleSheet.create({
  base: { fontFamily: FONT_FAMILY, fontSize: 16 },
});
