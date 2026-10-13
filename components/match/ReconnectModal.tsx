import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ReconnectModalProps {
  partnerName: string;
  partnerPhoto?: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

export const ReconnectModal: React.FC<ReconnectModalProps> = ({
  partnerName, partnerPhoto, onConfirm, onDismiss,
}) => {
  return (
    <View className="flex-1 bg-[#0F0C1A]/80 items-center justify-center relative">
      {/* Blurred Background */}
      <View className="absolute inset-0 bg-[#0F0C1A]" />

      {/* Modal Card */}
      <View className="relative z-10 w-full max-w-sm mx-[20px]">
        <View className="bg-primary-container/10 rounded-[32px] border border-white/10 p-[24px] items-center">
          {/* Diamond Badge */}
          <View className="w-12 h-12 rounded-full bg-[#1A1333] items-center justify-center mb-[24px] border border-secondary/20">
            <MaterialIcons name="diamond" size={24} color="#f4be4e" />
          </View>

          {/* Avatar */}
          <View className="relative mb-[12px]">
            <View className="w-24 h-24 rounded-full border-2 border-secondary/50 overflow-hidden">
              {partnerPhoto ? (
                <Image source={{ uri: partnerPhoto }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
              ) : (
                <View className="w-full h-full bg-surface-container-high items-center justify-center">
                  <MaterialIcons name="person" size={40} color="#928ea0" />
                </View>
              )}
            </View>
          </View>

          {/* Typography */}
          <Text className="text-[24px] font-semibold text-on-surface mb-[8px]">Bring Back the Spark?</Text>
          <Text className="text-[16px] text-on-surface-variant mb-[40px] px-[12px] text-center">
            Reconnect with {partnerName} for another 60 minutes.
          </Text>

          {/* Actions */}
          <View className="w-full gap-[8px] mb-[24px]">
            <TouchableOpacity
              className="w-full py-4 rounded-xl bg-primary-container items-center"
              onPress={onConfirm}
            >
              <Text className="text-[16px] font-semibold text-on-primary-container">Confirm Reconnect</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="w-full py-3 rounded-xl bg-transparent items-center"
              onPress={onDismiss}
            >
              <Text className="text-[16px] text-outline">Maybe Later</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Note */}
          <View className="flex-row items-center gap-[4px]">
            <MaterialIcons name="monetization-on" size={14} color="rgba(244,190,78,0.7)" />
            <Text className="text-[12px] font-bold text-secondary/70 uppercase tracking-widest">Uses 1 Reconnect Credit</Text>
          </View>
        </View>
      </View>
    </View>
  );
};
