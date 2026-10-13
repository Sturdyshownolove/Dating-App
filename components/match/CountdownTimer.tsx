import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';

interface CountdownTimerProps {
  partnerName: string;
  partnerAge?: number;
  matchId: string;
  timeRemaining: string; // e.g. "59:59"
  progress: number; // 0-1
  onEnterChat: () => void;
  onViewProfile: () => void;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  partnerName, partnerAge, matchId, timeRemaining, progress, onEnterChat, onViewProfile,
}) => {
  const circumference = 2 * Math.PI * 46;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View className="flex-1 bg-surface">
      {/* Top App Bar */}
      <View className="absolute top-0 w-full z-50 bg-[#0F0C1A]/80 border-b border-white/10 flex-row justify-between items-center h-16 px-5">
        <TouchableOpacity onPress={() => router.back()} className="p-2">
          <MaterialIcons name="arrow-back" size={24} color="#e5e0ed" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-white tracking-tighter uppercase">Fuuk'Up</Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <View className="flex-1 items-center justify-center pt-20 pb-24 px-[20px] relative">
        {/* Background Glow */}
        <View className="absolute inset-0 items-center justify-center z-0 opacity-30">
          <View className="w-96 h-96 bg-primary-container rounded-full opacity-40" />
          <View className="w-64 h-64 bg-secondary rounded-full opacity-30 ml-12 -mt-12" />
        </View>

        <View className="z-10 items-center w-full max-w-md">
          {/* Connection Info */}
          <View className="items-center mb-12">
            <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
              Your connection expires in
            </Text>
            <Text className="text-[24px] font-semibold text-on-surface">
              {partnerName}{partnerAge ? `, ${partnerAge}` : ''}
            </Text>
          </View>

          {/* Timer Ring */}
          <View className="relative w-72 h-72 mb-16 items-center justify-center">
            <Svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
              {/* Background Track */}
              <Circle cx="50" cy="50" r="46" fill="none" stroke="#2a2932" strokeWidth="2" />
              {/* Active Progress */}
              <Circle
                cx="50" cy="50" r="46" fill="none"
                stroke="#f4be4e" strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </Svg>
            {/* Center Display */}
            <View className="items-center z-10">
              <MaterialIcons name="timer" size={24} color="#f4be4e" style={{ marginBottom: 8 }} />
              <Text className="text-[40px] font-bold text-secondary tracking-tighter">{timeRemaining}</Text>
            </View>
          </View>

          {/* Actions */}
          <View className="w-full gap-[16px]">
            <TouchableOpacity
              className="w-full bg-primary-container py-4 px-6 rounded-xl items-center justify-center flex-row gap-3"
              onPress={onEnterChat}
            >
              <MaterialIcons name="chat-bubble" size={24} color="#faf6ff" />
              <Text className="text-[24px] font-semibold text-on-primary-container">Enter Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="w-full bg-surface-container-high border border-outline-variant py-4 px-6 rounded-xl items-center justify-center flex-row gap-3"
              onPress={onViewProfile}
            >
              <MaterialIcons name="person" size={24} color="#e5e0ed" />
              <Text className="text-[16px] text-on-surface">View Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};
