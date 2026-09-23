import React from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
// React Native's own SafeAreaView is a no-op on Android, and with edge-to-edge
// enabled (Android 15+ enforces it) screen content is drawn under the status
// bar. react-native-safe-area-context reads the real insets on both platforms.
// The *hook* (not its native SafeAreaView) is used on purpose: App.tsx hands
// the status-bar inset to the connectivity banner while that banner is up by
// overriding the insets context, and the native view ignores that override -
// it measures the window itself - which put a second status-bar gap under
// the banner.
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from './theme';

interface Props {
  children: ReactNode;
  /**
   * The screen's own ScreenHeader - rendered as the first, sticky child of
   * the scroll view so it pins to the top once scrolled past, exactly like
   * the web's `position: sticky` `.screen-header`.
   */
  header?: ReactNode;
  /** `false` for a screen that lays itself out (the PDF viewer) instead of scrolling a padded column. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * The `.screen` container: a 640px-max reading column with 24px/20px
 * padding on the web; on a phone that column is simply the whole width.
 */
export function Screen({ children, header, scroll = true, contentStyle }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentStyle]}
          stickyHeaderIndices={header ? [0] : undefined}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  fill: { flex: 1 },
  /** Web: `.screen { padding: 24px 20px }` */
  content: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 24 },
});
