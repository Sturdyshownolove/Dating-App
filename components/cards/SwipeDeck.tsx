import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Dimensions, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, runOnUI, interpolate, Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SwipeCard } from './SwipeCard';
import { UserProfile } from '@/services/firestore';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.3;
const VELOCITY_THRESHOLD = 800;
const FAST_FLICK_VELOCITY = 1500;
const EXIT_DURATION_NORMAL = 300;
const EXIT_DURATION_FAST = 180;
// Ask the parent to refill while a runway of cards is still visible — avoids
// the user reaching an empty deck before the network round-trip lands.
const PREFETCH_AT_REMAINING = 5;

export interface SwipeDeckRef {
  swipeLeft: () => void;
  swipeRight: () => void;
}

interface SwipeDeckProps {
  profiles: UserProfile[];
  onSwipe: (profile: UserProfile, action: 'like' | 'pass') => void;
  onEmpty?: () => void;
  /** When true, gesture is disabled and imperative methods are no-ops. */
  paused?: boolean;
}

const playHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export const SwipeDeck = forwardRef<SwipeDeckRef, SwipeDeckProps>(
  ({ profiles, onSwipe, onEmpty, paused = false }, ref) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const rotation = useSharedValue(0);

    const completeSwipe = (direction: 'like' | 'pass') => {
      if (profiles.length > 0) onSwipe(profiles[0], direction);
      if (profiles.length <= PREFETCH_AT_REMAINING && onEmpty) onEmpty();
    };

    // Worklet — runs on UI thread when called from gesture, or via runOnUI from JS.
    // Reset must land inside the timing callback so the next card mounts at origin
    // before React re-renders, avoiding the visible snap from exit position.
    const animateExit = (direction: 'like' | 'pass', velocityX: number) => {
      'worklet';
      const exit = direction === 'like' ? SCREEN_W * 1.5 : -SCREEN_W * 1.5;
      const rotEnd = direction === 'like' ? 20 : -20;
      const duration =
        Math.abs(velocityX) > FAST_FLICK_VELOCITY ? EXIT_DURATION_FAST : EXIT_DURATION_NORMAL;
      runOnJS(playHaptic)();
      translateX.value = withTiming(exit, { duration }, (finished) => {
        if (finished) {
          translateX.value = 0;
          translateY.value = 0;
          rotation.value = 0;
          runOnJS(completeSwipe)(direction);
        }
      });
      rotation.value = withTiming(rotEnd, { duration });
    };

    useImperativeHandle(ref, () => ({
      swipeLeft: () => {
        if (paused) return;
        runOnUI(animateExit)('pass', 0);
      },
      swipeRight: () => {
        if (paused) return;
        runOnUI(animateExit)('like', 0);
      },
    }), [paused]);

    const gesture = Gesture.Pan()
      .enabled(!paused)
      .onUpdate((event) => {
        translateX.value = event.translationX;
        translateY.value = event.translationY * 0.5;
        rotation.value = interpolate(
          event.translationX, [-SCREEN_W, 0, SCREEN_W], [-15, 0, 15]
        );
      })
      .onEnd((event) => {
        const goRight =
          event.translationX > SWIPE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD;
        const goLeft =
          event.translationX < -SWIPE_THRESHOLD || event.velocityX < -VELOCITY_THRESHOLD;
        if (goRight) {
          animateExit('like', event.velocityX);
        } else if (goLeft) {
          animateExit('pass', event.velocityX);
        } else {
          translateX.value = withSpring(0, { damping: 15 });
          translateY.value = withSpring(0, { damping: 15 });
          rotation.value = withSpring(0, { damping: 15 });
        }
      });

    const cardStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
      ],
    }));

    const likeOpacity = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
    }));

    const passOpacity = useAnimatedStyle(() => ({
      opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
    }));

    const bgCardStyle = useAnimatedStyle(() => {
      const scale = interpolate(
        Math.abs(translateX.value), [0, SWIPE_THRESHOLD], [0.92, 0.96], Extrapolation.CLAMP
      );
      return { transform: [{ scale }] };
    });

    if (profiles.length === 0) {
      return (
        <View className="flex-1 justify-center items-center p-10">
          <MaterialIcons name="search" size={60} color="#c8c4d7" className="mb-4" />
          <Text className="text-white text-2xl font-bold mb-2">No more profiles</Text>
          <Text className="text-white/60 text-base text-center">Check back later for new people</Text>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center">
        {/* Background card */}
        {profiles.length > 1 && (
          <Animated.View className="absolute z-[-1]" style={[bgCardStyle]}>
            <SwipeCard profile={profiles[1]} />
          </Animated.View>
        )}

        {/* Top card — swipeable */}
        <GestureDetector gesture={gesture}>
          <Animated.View className="absolute" style={[cardStyle]}>
            {/* LIKE overlay */}
            <Animated.View
              className="absolute top-10 right-5 z-10 px-4 py-2 border-[3px] rounded-xl border-[#ffb4ab]"
              style={[likeOpacity, { transform: [{ rotate: '15deg' }] }]}
            >
              <Text className="text-[#ffb4ab] text-3xl font-black tracking-widest">LIKE</Text>
            </Animated.View>
            {/* PASS overlay */}
            <Animated.View
              className="absolute top-10 left-5 z-10 px-4 py-2 border-[3px] rounded-xl border-[#f4be4e]"
              style={[passOpacity, { transform: [{ rotate: '-15deg' }] }]}
            >
              <Text className="text-[#f4be4e] text-3xl font-black tracking-widest">NOPE</Text>
            </Animated.View>

            <SwipeCard profile={profiles[0]} />
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }
);

SwipeDeck.displayName = 'SwipeDeck';
