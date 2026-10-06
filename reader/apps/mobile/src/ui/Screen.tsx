import React, { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ViewStyle, StyleProp } from 'react-native';
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
   * The screen's own ScreenHeader - a bar pinned to the top of the screen
   * that slides away while scrolling down and comes back on a small scroll
   * up (the web's `.screen-header`; the reader's bar does the same).
   */
  header?: ReactNode;
  /** `false` for a screen that lays itself out (the PDF viewer) instead of scrolling a padded column. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/** How far a scroll has to move in one step to show or hide the header - a small scroll up is enough to bring it back. */
const STEP = 6;
/** A one-line header's height before it has measured itself: 12 + 23 + 12. */
const HEADER_ESTIMATE = 47;

/**
 * The `.screen` container: a 640px-max reading column with 24px/20px
 * padding on the web; on a phone that column is simply the whole width.
 */
export function Screen({ children, header, scroll = true, contentStyle }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(HEADER_ESTIMATE);
  const hidden = useRef(new Animated.Value(0)).current;
  const shown = useRef(true);
  const lastY = useRef(0);

  const show = (visible: boolean) => {
    if (shown.current === visible) return;
    shown.current = visible;
    Animated.timing(hidden, { toValue: visible ? 0 : 1, duration: 180, useNativeDriver: true }).start();
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y <= headerHeight || dy < -STEP) show(true);
    else if (dy > STEP) show(false);
  };

  if (!scroll) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <View style={styles.fill}>
          {header}
          {children}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      {/* Clips the header as it slides up, so it never covers the status bar. */}
      <View style={styles.clip}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentStyle, header ? { paddingTop: headerHeight + 4 } : null]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="never"
          onScroll={header ? onScroll : undefined}
          scrollEventThrottle={32}
        >
          {children}
        </ScrollView>
        {header && (
          <Animated.View
            onLayout={(event) => setHeaderHeight(Math.round(event.nativeEvent.layout.height))}
            style={[styles.bar, { backgroundColor: colors.bg, transform: [{ translateY: hidden.interpolate({ inputRange: [0, 1], outputRange: [0, -(headerHeight + 2)] }) }] }]}
          >
            {header}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  clip: { flex: 1, overflow: 'hidden' },
  scroll: { flex: 1 },
  fill: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  /** Web: `.screen { padding: 24px 20px }` */
  content: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 24 },
});
