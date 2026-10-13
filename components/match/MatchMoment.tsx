import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { UserProfile } from '@/services/firestore';

interface MatchMomentProps {
  myPhoto?: string | null;
  partnerProfile?: UserProfile | null;
  matchId: string;
  onKeepSwiping: () => void;
}

export const MatchMoment: React.FC<MatchMomentProps> = ({ myPhoto, partnerProfile, matchId, onKeepSwiping }) => {
  return (
    <View className="flex-1 bg-background items-center justify-center relative">
      {/* Ambient Background Glow */}
      <View className="absolute top-[25%] left-[25%] w-96 h-96 bg-primary-container/20 rounded-full opacity-20" />
      <View className="absolute bottom-[25%] right-[25%] w-96 h-96 bg-secondary/10 rounded-full opacity-10" />

      {/* Main Content */}
      <View className="relative z-10 items-center justify-center w-full max-w-md px-[20px] py-[40px]">
        {/* Match Announcement */}
        <View className="mb-[24px] items-center">
          <Text className="text-[40px] font-bold text-secondary tracking-tighter mb-[4px]">It's a Match!</Text>
          <Text className="text-[18px] text-on-surface-variant">
            You and {partnerProfile?.name || 'someone'} liked each other.
          </Text>
        </View>

        {/* Avatar Cluster */}
        <View className="flex-row items-center justify-center gap-[8px] mb-[40px] relative">
          {/* My Avatar */}
          <View className="relative z-10 w-28 h-28 rounded-full border-2 border-surface overflow-hidden">
            {myPhoto ? (
              <Image source={{ uri: myPhoto }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
            ) : (
              <View className="w-full h-full bg-surface-container-high items-center justify-center">
                <MaterialIcons name="person" size={40} color="#928ea0" />
              </View>
            )}
          </View>

          {/* Heart Icon */}
          <View className="absolute z-20 w-10 h-10 rounded-full bg-surface/60 border border-white/10 items-center justify-center">
            <MaterialIcons name="favorite" size={24} color="#f4be4e" />
          </View>

          {/* Partner Avatar */}
          <View className="relative z-10 w-28 h-28 rounded-full border-2 border-surface overflow-hidden">
            {partnerProfile?.photos?.[0] ? (
              <Image source={{ uri: partnerProfile.photos[0] }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
            ) : (
              <View className="w-full h-full bg-surface-container-high items-center justify-center">
                <MaterialIcons name="person" size={40} color="#928ea0" />
              </View>
            )}
          </View>
        </View>

        {/* Timer Section */}
        <View className="items-center mb-[40px]">
          <Text className="text-[24px] font-semibold text-on-surface mb-[12px]">The clock is ticking...</Text>
          <View className="w-[120px] h-[120px] rounded-full border-4 border-secondary items-center justify-center">
            <Text className="text-[40px] font-bold text-secondary">59:59</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="w-full gap-[12px] mt-[24px]">
          <TouchableOpacity
            className="w-full py-4 px-6 bg-primary-container rounded-xl items-center justify-center flex-row gap-2"
            onPress={() => router.push(`/(tabs)/chat/${matchId}`)}
          >
            <MaterialIcons name="chat-bubble" size={24} color="#faf6ff" />
            <Text className="text-[24px] font-semibold text-white">Start Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="w-full py-4 px-6 bg-transparent border border-outline-variant rounded-xl items-center"
            onPress={onKeepSwiping}
          >
            <Text className="text-[24px] font-semibold text-on-surface-variant">Keep Swiping</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
