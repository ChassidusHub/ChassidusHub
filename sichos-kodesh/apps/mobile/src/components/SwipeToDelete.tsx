import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react-native';
import { useColors } from '../ui/theme';

interface Props {
  onDelete: () => void;
  children: ReactNode;
}

/** How far (px) the user must drag before releasing counts as "delete". */
const DELETE_THRESHOLD = 80;

/** Wraps `children` in a swipe-to-delete container: dragging the row sideways reveals a red backing with a trash icon on the side being swiped toward; releasing past DELETE_THRESHOLD commits the deletion, releasing before it snaps the row back. */
export function SwipeToDelete({ onDelete, children }: Props) {
  const colors = useColors();
  const offset = useRef(new Animated.Value(0)).current;
  const offsetValue = useRef(0);
  const direction = useRef(new Animated.Value(0)).current;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => {
        offsetValue.current = gesture.dx;
        direction.setValue(gesture.dx < 0 ? -1 : 1);
        offset.setValue(gesture.dx);
      },
      onPanResponderRelease: () => {
        const dx = offsetValue.current;
        offsetValue.current = 0;
        if (Math.abs(dx) >= DELETE_THRESHOLD) {
          Animated.timing(offset, { toValue: dx < 0 ? -1000 : 1000, duration: 250, useNativeDriver: true }).start(() => onDelete());
        } else {
          Animated.timing(offset, { toValue: 0, duration: 250, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        offsetValue.current = 0;
        Animated.timing(offset, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // The backing only shows while the row is actually displaced.
  const backingOpacity = offset.interpolate({ inputRange: [-20, 0, 20], outputRange: [1, 0, 1], extrapolate: 'clamp' });
  const iconOnRight = direction.interpolate({ inputRange: [-1, 1], outputRange: [1, 0] });
  const iconOnLeft = direction.interpolate({ inputRange: [-1, 1], outputRange: [0, 1] });

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.backing, { opacity: backingOpacity }]} pointerEvents="none">
        <Animated.View style={[styles.iconLeft, { opacity: iconOnLeft }]}>
          <Trash2 size={20} color="#fff" />
        </Animated.View>
        <Animated.View style={[styles.iconRight, { opacity: iconOnRight }]}>
          <Trash2 size={20} color="#fff" />
        </Animated.View>
      </Animated.View>
      <Animated.View {...responder.panHandlers} style={[styles.row, { backgroundColor: colors.bg, transform: [{ translateX: offset }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden', borderRadius: 8 },
  /** Web: `.swipe-to-delete-backing` - #e53e3e, white trash icon 20px from the revealed edge. */
  backing: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#e53e3e', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  iconLeft: {},
  iconRight: {},
  row: {},
});
