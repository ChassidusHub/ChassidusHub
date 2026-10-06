import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Loader2 } from 'lucide-react-native';

interface Props {
  size?: number;
  color: string;
}

/** The web's `Loader2` icon under its `download-spin` keyframes: one full turn per second, linear. */
export function Spinner({ size = 14, color }: Props) {
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}
