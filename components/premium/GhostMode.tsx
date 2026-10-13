import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface GhostModeProps {
  isActive: boolean;
  onToggle: (active: boolean) => void;
  onClose: () => void;
}

export const GhostMode: React.FC<GhostModeProps> = ({ isActive, onToggle, onClose }) => {
  const [enabled, setEnabled] = useState(isActive);

  const handleToggle = (val: boolean) => {
    setEnabled(val);
    onToggle(val);
  };

  return (
    <View className="flex-1 bg-[#0F0C1A]">
      {/* Top App Bar */}
      <View className="bg-[#0F0C1A]/80 border-b border-white/10 flex-row justify-between items-center w-full px-5 h-16">
        <TouchableOpacity onPress={onClose} className="p-2">
          <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-white">Fuuk'Up</Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <View className="flex-1 pt-8 pb-32 px-[20px] items-center justify-center relative">
        {/* Background Glow */}
        <View className="absolute top-[25%] left-[50%] w-96 h-96 bg-primary-container/10 rounded-full opacity-10" style={{ transform: [{ translateX: -192 }] }} />

        <View className="w-full max-w-md items-center gap-[24px] z-10">
          {/* Icon */}
          <View className="relative items-center justify-center mb-[12px]">
            <View className="w-24 h-24 rounded-full bg-surface-container-low/60 border border-[#D4AF37]/20 items-center justify-center">
              <MaterialIcons name="visibility-off" size={48} color="#FFC857" />
            </View>
          </View>

          {/* Header */}
          <View className="items-center gap-[4px]">
            <Text className="text-[32px] font-bold text-white tracking-tight">Ghost Mode</Text>
            <Text className="text-[16px] text-on-surface-variant max-w-[280px] text-center">
              Move through the shadows. See without being seen.
            </Text>
          </View>

          {/* Benefits List */}
          <View className="w-full bg-surface-container-low/60 border border-white/5 rounded-2xl p-[12px] gap-[8px] mt-[24px]">
            <BenefitItem icon="travel-explore" title="Browse unseen" desc="View profiles without leaving a trace in their visitor history." />
            <View className="h-[1px] bg-white/5" />
            <BenefitItem icon="favorite" title="Selective visibility" desc="Your profile is completely hidden until you swipe right." />
            <View className="h-[1px] bg-white/5" />
            <BenefitItem icon="do-not-disturb-on" title="Always offline" desc="Your online status indicator will remain permanently off." />
          </View>

          {/* Membership Badge */}
          <View className="flex-row items-center gap-2 bg-[#1A1333]/50 border border-[#D4AF37]/20 rounded-full py-2 px-4 mt-[24px]">
            <MaterialIcons name="workspace-premium" size={14} color="#D4AF37" />
            <Text className="text-[12px] font-bold text-[#D4AF37] uppercase tracking-widest">Aura Luxe Included</Text>
          </View>
        </View>
      </View>

      {/* Bottom Action Area */}
      <View className="absolute bottom-0 left-0 right-0 bg-surface-container-low/60 border-t border-white/5 rounded-t-3xl p-[20px]">
        <View className="max-w-md mx-auto gap-[24px]">
          {/* Toggle */}
          <View className="flex-row items-center justify-between px-2">
            <View>
              <Text className="text-[18px] text-white font-medium">Activate Ghost Mode</Text>
              <Text className="text-[14px] text-on-surface-variant">Enable total privacy</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: '#1A1333', true: '#D4AF37' }}
              thumbColor="#fff"
            />
          </View>
          {/* Status */}
          <View className="items-center">
            <Text className="text-[12px] font-bold text-[#D4AF37]/80 uppercase tracking-widest">
              {enabled ? 'GHOST MODE IS CURRENTLY ACTIVE' : 'GHOST MODE IS OFF'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const BenefitItem: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <View className="flex-row items-start gap-[12px] p-[12px] rounded-xl">
    <View className="mt-1 w-8 h-8 rounded-full bg-primary-container/20 items-center justify-center">
      <MaterialIcons name={icon as any} size={16} color="#6c5ce7" />
    </View>
    <View className="flex-1">
      <Text className="text-[16px] text-white font-medium">{title}</Text>
      <Text className="text-[14px] text-on-surface-variant/80 mt-1">{desc}</Text>
    </View>
  </View>
);
