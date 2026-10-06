import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { useColors } from '../ui/theme';

interface Props {
  /** 0-100. */
  percent: number;
  onSeek: (percent: number) => void;
  /** Fires with the live value while a finger is down - the bar shows this instead of the ticking playback position for the whole drag. */
  onDrag: (percent: number | null) => void;
  accessibilityLabel: string;
}

/**
 * The player bar's range input: a 4px pill track, accent fill, 12px round
 * thumb - the web's `.global-player-range` styling, driven by a pan
 * responder instead of a native slider (no extra native dependency, and
 * the fill can mirror for Hebrew the way the web's `dir="rtl"` rule does).
 */
export function Scrubber({ percent, onSeek, onDrag, accessibilityLabel }: Props) {
  const colors = useColors();
  const { isRtl } = useTranslation();
  const widthRef = useRef(0);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  function percentAt(x: number): number {
    const width = widthRef.current;
    if (width <= 0) return 0;
    const fraction = Math.max(0, Math.min(x / width, 1));
    return (isRtl ? 1 - fraction : fraction) * 100;
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        const next = percentAt(event.nativeEvent.locationX);
        dragRef.current = next;
        setDragPercent(next);
        onDrag(next);
      },
      onPanResponderMove: (event) => {
        const next = percentAt(event.nativeEvent.locationX);
        dragRef.current = next;
        setDragPercent(next);
        onDrag(next);
      },
      onPanResponderRelease: () => {
        const next = dragRef.current;
        dragRef.current = null;
        setDragPercent(null);
        onDrag(null);
        if (next != null) onSeek(next);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPercent(null);
        onDrag(null);
      },
    }),
  ).current;

  const shown = Math.max(0, Math.min(dragPercent ?? percent, 100));

  return (
    <View
      {...responder.panHandlers}
      style={styles.hitArea}
      onLayout={(event) => {
        widthRef.current = event.nativeEvent.layout.width;
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown) }}
    >
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { backgroundColor: colors.accent, width: `${shown}%` }, isRtl ? styles.fillRtl : styles.fillLtr]} />
      </View>
      <View style={[styles.thumb, { backgroundColor: colors.accent }, isRtl ? { right: `${shown}%` } : { left: `${shown}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: { width: '100%', height: 24, justifyContent: 'center' },
  track: { height: 4, borderRadius: 999, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 999 },
  fillLtr: { left: 0 },
  fillRtl: { right: 0 },
  thumb: { position: 'absolute', top: 6, width: 12, height: 12, borderRadius: 6, marginLeft: -6, marginRight: -6 },
});
