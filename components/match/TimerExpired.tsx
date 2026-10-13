import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

interface TimerExpiredProps {
  partnerName: string;
  onReturnToDiscovery: () => void;
  onUnlockPremium: () => void;
}

export const TimerExpired: React.FC<TimerExpiredProps> = ({
  partnerName, onReturnToDiscovery, onUnlockPremium,
}) => {
  const circumference = 2 * Math.PI * 45;

  return (
    <View className="flex-1 bg-[#0F0C1A] items-center justify-center relative">
      {/* Background Glows */}
      <View className="absolute top-[25%] left-[25%] w-96 h-96 bg-primary-container/10 rounded-full opacity-40" />
      <View className="absolute bottom-[25%] right-[25%] w-96 h-96 bg-secondary/10 rounded-full opacity-40" />

      {/* Main Content */}
      <View className="w-full max-w-md px-[20px] items-center z-10 gap-[40px]">
        {/* Timer Ring (Zeroed Out) */}
        <View className="relative w-64 h-64 items-center justify-center">
          <Svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="45" fill="none" stroke="#1A1333" strokeWidth="2" />
          </Svg>
          <Svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }], opacity: 0.3 }}>
            <Circle cx="50" cy="50" r="45" fill="none" stroke="#474554" strokeWidth="2"
              strokeDasharray={circumference} strokeDashoffset={circumference} />
          </Svg>
          <View className="items-center">
            <Text className="text-[40px] font-bold text-outline-variant">00:00</Text>
            <Text className="text-[12px] font-bold text-outline-variant mt-2 uppercase tracking-widest">Expired</Text>
          </View>
        </View>

        {/* Typography */}
        <View className="items-center gap-[12px]">
          <Text className="text-[32px] font-bold text-on-background">Connection Expired</Text>
          <Text className="text-[16px] text-on-surface-variant max-w-[280px] text-center">
            The clock has run out. Your window with {partnerName} has closed. Don't let the next one slip away.
          </Text>
        </View>

        {/* Premium Upsell Card */}
        <View className="w-full bg-[#1A1333]/80 rounded-xl border border-white/10 p-[24px] relative overflow-hidden">
          <View className="absolute inset-0 bg-secondary/5 opacity-50" />
          <View className="relative z-10 items-center gap-[12px]">
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialIcons name="workspace-premium" size={24} color="#f4be4e" />
              <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">Aura Luxe</Text>
            </View>
            <Text className="text-[24px] font-semibold text-on-background text-center">Reconnect with {partnerName}?</Text>
            <Text className="text-[16px] text-on-surface-variant text-center">
              Upgrade to Aura Luxe to extend expired timers and regain lost connections.
            </Text>
            <TouchableOpacity
              className="mt-[24px] w-full py-3 px-6 rounded-full bg-secondary/10 border border-secondary items-center"
              onPress={onUnlockPremium}
            >
              <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">Unlock Aura Luxe</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Return Button */}
        <TouchableOpacity
          className="w-full py-4 rounded-full bg-primary-container items-center"
          onPress={onReturnToDiscovery}
        >
          <Text className="text-[12px] font-bold text-on-primary-container uppercase tracking-widest">Return to Discovery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
