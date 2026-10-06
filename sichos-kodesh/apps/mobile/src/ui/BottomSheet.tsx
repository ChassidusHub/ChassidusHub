import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n/useTranslation';
import { AppText } from './Text';
import { useColors } from './theme';

interface Props {
  visible: boolean;
  /** Its heading beside the handle; none for a sheet that sets its own (the full player). */
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Up to nearly the whole screen, for a sheet that is a screen of its own (the full player); else up to about three quarters. */
  tall?: boolean;
}

/** How far down (pt), or how fast, a drag has to go to close the sheet rather than spring back. */
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 0.9;

/**
 * A sheet over the lower part of the screen, for settings whose effect
 * shows at once on the page above it (the reader's, the PDF reader's).
 * It follows the finger down and closes past a short distance or on a
 * flick - from its handle and title, or from anywhere in it once its
 * contents are scrolled to the top - and springs back otherwise. A tap
 * on the page above closes it too (web: `.reader-panel`).
 */
export function BottomSheet({ visible, title, onClose, children, tall = false }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRtl } = useTranslation();
  const drag = useRef(new Animated.Value(0)).current;
  const atTop = useRef(true);

  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  const close = useCallback(() => {
    Animated.timing(drag, { toValue: 800, duration: 180, useNativeDriver: true }).start(() => onClose());
  }, [drag, onClose]);

  const pan = useMemo(() => {
    const downward = (dx: number, dy: number) => dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.4;
    return PanResponder.create({
      // The handle and title take any downward drag; the contents only once scrolled to the top.
      onMoveShouldSetPanResponder: (_, g) => downward(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => atTop.current && downward(g.dx, g.dy),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) close();
        else Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    });
  }, [drag, close]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = event.nativeEvent.contentOffset.y <= 0;
  };
  const shade = drag.interpolate({ inputRange: [0, 400], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Animated.View style={[styles.backdropShade, { opacity: shade }]} pointerEvents="none" />
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t.readerClose} />
      <Animated.View
        {...pan.panHandlers}
        style={[styles.sheet, tall && styles.tall, { backgroundColor: colors.bgElevated, borderColor: colors.border, paddingBottom: insets.bottom + 12, transform: [{ translateY: drag }] }]}
      >
        <View style={styles.handleArea}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title ? <AppText style={[styles.title, { textAlign: isRtl ? 'right' : 'left' }]}>{title}</AppText> : null}
        </View>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} bounces={false} overScrollMode="never">
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '72%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tall: { maxHeight: '92%' },
  /** Tall enough to catch a thumb: the handle and the title together. */
  handleArea: { paddingBottom: 6 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', paddingHorizontal: 20 },
  body: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
});
