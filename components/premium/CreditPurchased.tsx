import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface CreditPurchasedProps {
  creditsAdded: number;
  totalCredits: number;
  onBackToDiscovery: () => void;
}

export const CreditPurchased: React.FC<CreditPurchasedProps> = ({
  creditsAdded, totalCredits, onBackToDiscovery,
}) => {
  return (
    <View className="flex-1 bg-background">
      {/* Ambient Glow */}
      <View className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] opacity-[0.03]" />

      {/* Top App Bar */}
      <View className="absolute top-0 left-0 right-0 z-50 flex-row justify-between items-center px-5 h-16 bg-[#0F0C1A] border-b border-white/5">
        <TouchableOpacity onPress={onBackToDiscovery} className="p-2 rounded-full">
          <MaterialIcons name="close" size={24} color="#6c5ce7" />
        </TouchableOpacity>
        <Text className="text-white uppercase tracking-widest text-[12px] font-bold">PURCHASE SUCCESS</Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <View className="flex-1 pt-24 px-[20px] relative z-10">
        <View className="flex-1 justify-center items-center">
          {/* Luxury Graphic */}
          <View className="relative items-center justify-center mb-[40px]">
            {/* Halo */}
            <View className="absolute w-40 h-40 bg-secondary/15 rounded-full opacity-60" />
            <View className="absolute w-24 h-24 bg-secondary-fixed/20 rounded-full" />
            {/* Coin/Badge */}
            <View className="w-28 h-28 rounded-full border border-secondary/20 bg-surface-container-highest/40 items-center justify-center overflow-hidden">
              <MaterialIcons name="check-circle" size={56} color="#f4be4e" />
            </View>
          </View>

          {/* Typography */}
          <View className="items-center w-full max-w-sm mb-[40px]">
            <Text className="text-[32px] font-bold text-on-surface mb-[4px] tracking-tight">Credits Added</Text>
            <Text className="text-[16px] text-on-surface-variant/80 text-center">
              Your account has been credited with{' '}
              <Text className="text-secondary font-bold">{creditsAdded} Reconnect Credits</Text>.{' '}
              You're ready to bring back the spark.
            </Text>
          </View>

          {/* Summary Card */}
          <View className="w-full max-w-sm p-6 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 relative overflow-hidden">
            <View className="flex-row justify-between items-center mb-[12px] z-10">
              <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest opacity-80">New Balance</Text>
              <MaterialIcons name="auto-awesome" size={20} color="rgba(244,190,78,0.7)" />
            </View>
            <View className="flex-row items-baseline gap-2 z-10">
              <Text className="text-[40px] font-bold text-on-surface">{totalCredits}</Text>
              <Text className="text-[16px] text-on-surface-variant">Credits available</Text>
            </View>
          </View>
        </View>

        {/* Primary Action */}
        <View className="w-full max-w-sm mx-auto mt-8 mb-6">
          <TouchableOpacity
            className="w-full py-4 rounded-full bg-primary-container items-center justify-center relative overflow-hidden"
            onPress={onBackToDiscovery}
          >
            <Text className="relative z-10 font-bold text-on-primary-container text-[18px]">Back to Discovery</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
