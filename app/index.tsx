import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useAuthStore } from '@/store/authStore';
import { correctAuthRoute } from '@/utils/authStage';

export default function SplashScreen() {
  const { isAuthenticated, isLoading, profile, user, emailVerified } = useAuthStore();
  const isEmailUser = !!user?.providerData?.some((p) => p.providerId === 'password');

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      router.replace(
        correctAuthRoute({
          isAuthenticated,
          profile,
          isEmailUser,
          emailVerified,
        }) as never
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, profile, isEmailUser, emailVerified]);

  return (
    <View className="flex-1 bg-surface-container-lowest items-center justify-center relative">
      {/* Subtle Gold Glow (Halo) */}
      <View className="absolute w-32 h-32 bg-secondary rounded-full opacity-30" />

      {/* Logo */}
      <Animated.View entering={ZoomIn.springify()} className="items-center z-10">
        <Animated.Text
          entering={FadeIn.delay(300)}
          className="text-[40px] font-bold text-on-background tracking-tighter"
        >
          Fuuk'Up
        </Animated.Text>
      </Animated.View>

      {/* Footer */}
      <Animated.Text
        entering={FadeIn.delay(1200)}
        className="absolute bottom-[60px] text-outline text-[14px]"
      >
        Real connections. Real urgency.
      </Animated.Text>
    </View>
  );
}
