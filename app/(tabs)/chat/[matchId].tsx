import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { Timer } from '@/components/ui/Timer';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { getMatchById, getUserProfile, UserProfile, Match } from '@/services/firestore';
import { uploadChatImage } from '@/services/storage';
import { formatMessageTime } from '@/utils/time';

export default function ChatScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { user } = useAuthStore();
  const { messages, isTyping, isLocked, subscribe, subscribeTyping, send, markSeen, updateTyping, setLocked } = useChatStore();
  const [match, setMatch] = useState<Match | null>(null);
  const [partner, setPartner] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!matchId || !user) return;
    const load = async () => {
      const m = await getMatchById(matchId);
      setMatch(m);
      if (m) {
        const partnerId = m.userA === user.uid ? m.userB : m.userA;
        const p = await getUserProfile(partnerId);
        setPartner(p);
        const expired = !m.isActive || m.isBlocked || new Date() > m.expiresAt;
        setLocked(expired);
      }
    };
    load();
    const unsubMsg = subscribe(matchId);
    const unsubTyp = subscribeTyping(matchId, user.uid);
    return () => { unsubMsg(); unsubTyp(); };
  }, [matchId, user]);

  useEffect(() => {
    if (matchId && user) markSeen(matchId, user.uid);
  }, [messages]);

  const handleSend = useCallback((text: string) => {
    if (!matchId || !user) return;
    send(matchId, user.uid, text);
  }, [matchId, user]);

  const handleSendImage = useCallback(async (uri: string) => {
    if (!matchId || !user) return;
    const url = await uploadChatImage(matchId, user.uid, uri);
    if (url) send(matchId, user.uid, '', url);
  }, [matchId, user]);

  const handleTyping = useCallback((typing: boolean) => {
    if (!matchId || !user) return;
    updateTyping(matchId, user.uid, typing);
  }, [matchId, user]);

  const handleExpire = () => setLocked(true);

  return (
    <View className="flex-1 bg-[#0F0C1A]">
      {/* Top App Bar */}
      <View className="absolute top-0 w-full z-50 bg-[#0F0C1A]/80 border-b border-white/10 flex-row justify-between items-center h-16 px-5 pt-0">
        <TouchableOpacity onPress={() => router.back()} className="p-2 rounded-full">
          <MaterialIcons name="arrow-back" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View className="flex-row items-center gap-3">
          <View className="relative">
            <Avatar uri={partner?.photos?.[0] || null} name={partner?.name} size={32} />
            {!isLocked && <View className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0F0C1A]" />}
          </View>
          <Text className="text-xl font-black text-white tracking-tighter uppercase">
            {partner?.name || '...'}{partner?.age ? `, ${partner.age}` : ''}
          </Text>
        </View>
        <TouchableOpacity className="p-2 rounded-full">
          <MaterialIcons name="schedule" size={24} color="#6c5ce7" />
        </TouchableOpacity>
      </View>

      {/* Timer Bar */}
      {match && !isLocked && (
        <View className="absolute top-16 w-full z-40 bg-[#0F0C1A] px-5 py-2">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">TIME REMAINING</Text>
            <Timer
              expiresAt={match.expiresAt}
              // Derived from the actual match window so the progress
              // bar shows true elapsed-of-total, not just elapsed-
              // since-mount (which would render 100% on every fresh
              // open mid-match — see ux_timer_percentage_2026-05-24).
              totalDuration={Math.floor(
                (match.expiresAt.getTime() - match.createdAt.getTime()) / 1000
              )}
              size="sm"
              onExpire={handleExpire}
            />
          </View>
          <View className="w-full h-1.5 bg-[#1A1333] rounded-full overflow-hidden">
            <View className="h-full bg-secondary w-3/4 rounded-full" />
          </View>
        </View>
      )}

      {/* Locked Banner */}
      {isLocked && (
        <View className="absolute top-16 w-full z-40 bg-[#0F0C1A] px-5 py-3">
          <View className="flex-row items-center justify-center gap-2 bg-error-container/20 py-2 px-4 rounded-full">
            <MaterialIcons name="lock" size={14} color="#ffb4ab" />
            <Text className="text-[12px] font-bold text-error uppercase tracking-widest">Time's up — chat is locked</Text>
          </View>
        </View>
      )}

      {/* System Message */}
      <View className="pt-28 items-center my-4">
        <View className="bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
          <Text className="text-[12px] font-bold text-white/50 uppercase tracking-widest">
            MATCH SECURED. 15 MINS TO CONNECT.
          </Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item, index }) => (
          <MessageBubble
            text={item.text}
            imageUrl={item.imageUrl}
            isMine={item.senderId === user?.uid}
            time={formatMessageTime(item.timestamp)}
            seen={item.seen}
            isLast={index === 0}
          />
        )}
        contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 20 }}
        ListHeaderComponent={<TypingIndicator visible={isTyping} />}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center pt-24">
            <Text className="text-white/30 text-[16px]">Say hi! ⏰ Clock is ticking</Text>
          </View>
        }
      />

      {/* Input Area */}
      <ChatInput
        onSend={handleSend}
        onSendImage={handleSendImage}
        onTyping={handleTyping}
        disabled={isLocked}
      />
    </View>
  );
}
