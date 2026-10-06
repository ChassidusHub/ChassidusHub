import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';

// Same timing as apps/web/src/components/OverflowMarquee.tsx.
const START_PAUSE_MS = 1000;
const END_PAUSE_MS = 1000;
const SCROLL_PX_PER_SECOND = 28;
const MIN_SCROLL_MS = 2500;

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
}

/**
 * A one-line label that, when wider than the space it has, slowly scrolls
 * its hidden tail into view, pauses, and snaps back - instead of clipping
 * to an ellipsis. The web's settings option rows do exactly this; a label
 * like "Auto-download automatically when the app opens" has no shorter
 * form that still says what it does.
 */
export function OverflowMarquee({ text, style }: Props) {
  const { isRtl } = useTranslation();
  const [outerWidth, setOuterWidth] = useState(0);
  const [innerWidth, setInnerWidth] = useState(0);
  const offset = useRef(new Animated.Value(0)).current;
  const overflow = Math.max(innerWidth - outerWidth, 0);

  useEffect(() => {
    offset.setValue(0);
    if (overflow <= 0) return;
    // Hebrew text is anchored at the right edge and hides its tail on the
    // left, so it scrolls the other way.
    const direction = isRtl ? 1 : -1;
    const scrollMs = Math.max((overflow / SCROLL_PX_PER_SECOND) * 1000, MIN_SCROLL_MS);
    const cycle = Animated.loop(
      Animated.sequence([
        Animated.delay(START_PAUSE_MS),
        Animated.timing(offset, { toValue: direction * overflow, duration: scrollMs, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(END_PAUSE_MS),
        Animated.timing(offset, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    cycle.start();
    return () => cycle.stop();
  }, [overflow, isRtl, offset]);

  return (
    <View style={styles.outer} onLayout={(event) => setOuterWidth(event.nativeEvent.layout.width)}>
      <Animated.View
        style={[styles.inner, isRtl ? styles.innerRtl : styles.innerLtr, { transform: [{ translateX: offset }] }]}
        onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}
      >
        <AppText style={[styles.text, style]}>{text}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Takes the row's remaining width and clips; the inner strip is free to be wider. */
  outer: { flexShrink: 1, flexGrow: 1, minWidth: 0, overflow: 'hidden' },
  inner: { flexDirection: 'row', flexShrink: 0 },
  /** Anchored to the reading-start edge, so the hidden tail is on the far side. */
  innerLtr: { alignSelf: 'flex-start' },
  innerRtl: { alignSelf: 'flex-end' },
  text: { flexShrink: 0 },
});
