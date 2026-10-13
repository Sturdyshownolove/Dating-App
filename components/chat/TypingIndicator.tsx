import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withDelay, withSequence,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/theme';

export const TypingIndicator: React.FC<{ visible: boolean }> = ({ visible }) => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      const bounce = (delay: number) =>
        withDelay(delay, withRepeat(
          withSequence(
            withTiming(-6, { duration: 300 }),
            withTiming(0, { duration: 300 })
          ), -1, true
        ));
      dot1.value = bounce(0);
      dot2.value = bounce(150);
      dot3.value = bounce(300);
    } else {
      dot1.value = 0;
      dot2.value = 0;
      dot3.value = 0;
    }
  }, [visible]);

  const style1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const style2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const style3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <Animated.View style={[styles.dot, style1]} />
        <Animated.View style={[styles.dot, style2]} />
        <Animated.View style={[styles.dot, style3]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4, alignItems: 'flex-start' },
  bubble: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: COLORS.cardElevated, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.textMuted,
  },
});
