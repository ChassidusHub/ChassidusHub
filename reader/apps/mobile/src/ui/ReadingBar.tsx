import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { BackLink } from './BackLink';
import type { BackTarget } from './BackLink';
import { AppText } from './Text';
import { row } from './rtl';

/** The bar's height, below the status bar. */
export const READING_BAR_HEIGHT = 56;

interface Props {
  back: BackTarget;
  /** What is open: a chapter, a PDF's name. */
  title: string;
  /** What it belongs to, in a small line above the title: the sefer, the farbrengen. */
  context?: string;
  /** Whether the bar has stepped aside: on a scroll down, or a tap on the page. */
  hidden: boolean;
  /** The page's own colours: the reader's paper, or the app's theme over a PDF. */
  palette: { background: string; rule: string; text: string; muted: string };
  /**
   * Over the page, sliding away (the reader, whose text scrolls under it
   * from below it); or `false`, standing above the page and gone
   * outright when hidden (the PDF, whose pages can't start below a bar
   * that floats over them).
   */
  overlay?: { top: number } | false;
  /** Its buttons at the end: a bookmark, the settings. */
  children?: ReactNode;
}

/**
 * The one top bar of the reader and the PDF (docs: the UI/UX redo plan,
 * "Reader and PDF"; web: ReadingBar): back, what is open under what it
 * belongs to, and the page's own buttons - the settings always last.
 */
export function ReadingBar({ back, title, context, hidden, palette, overlay = false, children }: Props) {
  const { isRtl } = useTranslation();
  const away = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(away, { toValue: hidden ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [away, hidden]);

  const content = (
    <View style={[styles.row, { flexDirection: row(isRtl) }]}>
      <BackLink fallback={back} />
      <View style={styles.titles}>
        {context ? (
          <AppText numberOfLines={1} style={[styles.context, { color: palette.muted }]}>
            {context}
          </AppText>
        ) : null}
        <AppText numberOfLines={1} style={[styles.title, { color: palette.text }]}>
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );

  if (!overlay) {
    if (hidden) return null;
    return <View style={[styles.bar, { backgroundColor: palette.background, borderBottomColor: palette.rule }]}>{content}</View>;
  }
  const translateY = away.interpolate({ inputRange: [0, 1], outputRange: [0, -(READING_BAR_HEIGHT + 2)] });
  return (
    <Animated.View style={[styles.bar, styles.overlay, { top: overlay.top, backgroundColor: palette.background, borderBottomColor: palette.rule, transform: [{ translateY }] }]}>{content}</Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { height: READING_BAR_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  overlay: { position: 'absolute', left: 0, right: 0, zIndex: 1 },
  row: { flex: 1, alignItems: 'center', paddingHorizontal: 12, gap: 4 },
  titles: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
  context: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700' },
});
