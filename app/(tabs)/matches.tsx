import React, { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { MatchCard } from '@/components/match/MatchCard';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';

export default function MatchesScreen() {
  const { user } = useAuthStore();
  const { activeMatches, expiredMatches, matchProfiles, isLoading, subscribe } = useMatchStore();

  useEffect(() => {
    if (!user) return;
    const unsub = subscribe(user.uid);
    return unsub;
  }, [user]);

  const allMatches = [...activeMatches, ...expiredMatches];

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row justify-between items-baseline px-[20px] pt-14 pb-[8px]">
        <Text className="text-[32px] font-bold text-on-surface tracking-tight">Matches</Text>
        <Text className="text-[12px] font-bold text-primary uppercase tracking-widest">
          {activeMatches.length} active
        </Text>
      </View>

      {/* Timer Bar Hint */}
      {activeMatches.length > 0 && (
        <View className="px-[20px] py-[8px]">
          <View className="flex-row items-center gap-2 bg-surface-container/50 border border-white/5 rounded-full px-4 py-2 self-start">
            <MaterialIcons name="timer" size={14} color="#f4be4e" />
            <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">
              {activeMatches.length} clocks ticking
            </Text>
          </View>
        </View>
      )}

      {allMatches.length === 0 ? (
        <View className="flex-1 justify-center items-center p-[40px]">
          <View className="w-20 h-20 rounded-full bg-primary-container/10 items-center justify-center mb-[24px]">
            <MaterialIcons name="favorite" size={40} color="#6c5ce7" />
          </View>
          <Text className="text-[24px] font-bold text-on-surface mb-[8px]">No matches yet</Text>
          <Text className="text-[16px] text-on-surface-variant text-center">Keep swiping to find your match!</Text>
        </View>
      ) : (
        <FlatList
          data={allMatches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const partnerId = item.userA === user?.uid ? item.userB : item.userA;
            return (
              <MatchCard
                match={item}
                partner={matchProfiles[partnerId]}
                onPress={() => router.push(`/(tabs)/chat/${item.id}`)}
              />
            );
          }}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
