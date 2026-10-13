import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { usePremiumStore } from '@/store/premiumStore';
import { TIERS, TierLevel } from '@/constants/tiers';

export default function PremiumScreen() {
  const { user, profile } = useAuthStore();
  // Tier of truth is `profile.tierLevel`, written server-side by the
  // syncTierFromEntitlements CF. The premium store no longer mirrors it.
  const currentTier: TierLevel = profile?.tierLevel ?? 'FREE';
  const { offerings, isLoading, purchase, restore } = usePremiumStore();
  const [selectedTier, setSelectedTier] = useState<TierLevel>('TIER_2');

  const handlePurchase = async () => {
    if (!user || selectedTier === 'FREE') return;
    const tierConfig = TIERS[selectedTier];
    const pkg = offerings.find((o) => o.identifier === tierConfig.revenueCatId);
    if (pkg) {
      await purchase(pkg, user.uid);
    }
  };

  const handleRestore = async () => {
    if (!user) return;
    await restore(user.uid);
  };

  return (
    <ScrollView className="flex-1 bg-[#0F0C1A]" contentContainerStyle={{ paddingTop: 100, paddingBottom: 120, paddingHorizontal: 20 }}>
      {/* Background Glows */}
      <View className="absolute top-0 left-1/2 w-96 h-96 bg-secondary-container/10 rounded-full opacity-30" style={{ transform: [{ translateX: -192 }] }} />
      <View className="absolute bottom-0 right-0 w-72 h-72 bg-primary-container/10 rounded-full opacity-30" />

      {/* Top App Bar */}
      <View className="absolute top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0F0C1A]/80 flex-row justify-between items-center h-16 px-5">
        <View className="w-10" />
        <Text className="text-xl font-black text-white tracking-tighter uppercase">Fuuk'Up</Text>
        <TouchableOpacity className="p-2">
          <MaterialIcons name="schedule" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>

      {/* Hero Section */}
      <View className="items-center mb-[24px]">
        <View className="w-16 h-16 rounded-full bg-surface-container-low/60 border border-secondary/30 items-center justify-center mb-[12px]">
          <MaterialIcons name="workspace-premium" size={40} color="#FFC857" />
        </View>
        <Text className="text-[40px] font-bold text-secondary tracking-tight text-center">Unlock Elite</Text>
        <Text className="text-[18px] text-on-surface-variant text-center mt-[4px] max-w-[300px]">
          Elevate your experience to the highest tier. Priority access, exclusive features.
        </Text>
      </View>

      {/* Standard Premium Card */}
      <TouchableOpacity
        className={`bg-surface-container-low/60 border rounded-3xl p-[24px] mb-[24px] ${selectedTier === 'TIER_1' ? 'border-primary-container' : 'border-white/10'}`}
        onPress={() => setSelectedTier('TIER_1')}
        activeOpacity={0.8}
      >
        <View className="mb-[24px]">
          <Text className="text-[32px] font-bold text-on-surface mb-[4px]">Fuuk'Up Plus</Text>
          <Text className="text-[16px] text-on-surface-variant">Essential enhancements for the active socialite.</Text>
        </View>
        <View className="mb-[40px]">
          <Text className="text-[40px] font-bold text-on-surface">
            ${TIERS.TIER_1.price || '19'}<Text className="text-[16px] text-on-surface-variant">/mo</Text>
          </Text>
        </View>
        <View className="gap-[12px] mb-[40px]">
          <FeatureItem icon="check-circle" text="Unlimited Swipes" />
          <FeatureItem icon="visibility" text="See Who Liked You" />
          <FeatureItem icon="undo" text="Unlimited Rewinds" />
        </View>
        <View className={`w-full py-[12px] rounded-full items-center ${selectedTier === 'TIER_1' ? 'bg-primary-container' : 'bg-surface-container-high border border-outline-variant'}`}>
          <Text className={`text-[18px] ${selectedTier === 'TIER_1' ? 'text-on-primary-container font-semibold' : 'text-on-surface'}`}>
            {currentTier === 'TIER_1' ? 'Current Plan' : 'Select Plus'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Aura Luxe Card (Hero) */}
      <TouchableOpacity
        className={`bg-surface-container-low/60 border rounded-[32px] p-[24px] mb-[24px] relative overflow-hidden ${selectedTier === 'TIER_2' || selectedTier === 'TIER_3' ? 'border-secondary/40' : 'border-white/10'}`}
        onPress={() => setSelectedTier('TIER_2')}
        activeOpacity={0.8}
      >
        {/* Glossy overlay */}
        <View className="absolute top-0 right-0 w-64 h-64 bg-secondary/20 rounded-full opacity-30" style={{ transform: [{ translateY: -128 }, { translateX: 80 }] }} />

        <View className="z-10">
          {/* Badge */}
          <View className="flex-row items-center px-[12px] py-[4px] rounded-full bg-secondary-container/20 border border-secondary/30 mb-[12px] self-start">
            <MaterialIcons name="stars" size={14} color="#f4be4e" />
            <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest ml-[4px]">Most Exclusive</Text>
          </View>

          <Text className="text-[40px] font-bold text-secondary mb-[4px]">Aura Luxe</Text>
          <Text className="text-[18px] text-on-surface-variant mb-[24px]">The ultimate status symbol. Unrestricted access.</Text>

          <View className="mb-[40px]">
            <Text className="text-[40px] font-bold text-on-surface">
              ${TIERS.TIER_2.price || '99'}<Text className="text-[16px] text-on-surface-variant">/mo</Text>
            </Text>
          </View>

          {/* Feature Grid */}
          <View className="gap-[12px] mb-[40px]">
            <FeatureCard icon="timer" title="Extended Timers" desc="Double the time to reply to exclusive matches." />
            <FeatureCard icon="verified" title="Aura Badge" desc="Stand out with the coveted gold verification mark." />
            <FeatureCard icon="rocket-launch" title="Priority Match" desc="Your profile is shown first to top-tier users." />
            <FeatureCard icon="visibility-off" title="Ghost Mode" desc="Browse unseen, appear offline." />
          </View>

          <View className={`w-full py-[12px] rounded-full items-center ${selectedTier === 'TIER_2' ? 'bg-secondary' : 'bg-surface-container-high border border-outline-variant'}`}>
            <Text className={`text-[18px] font-semibold ${selectedTier === 'TIER_2' ? 'text-on-secondary' : 'text-on-surface'}`}>
              {currentTier === 'TIER_2' ? 'Current Plan' : 'Select Aura Luxe'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Purchase Button */}
      {currentTier !== selectedTier && (
        <TouchableOpacity
          className="w-full bg-primary-container py-[16px] rounded-xl items-center mb-[16px]"
          onPress={handlePurchase}
          disabled={isLoading}
          style={{ opacity: isLoading ? 0.6 : 1 }}
        >
          <Text className="text-on-primary-container text-[18px] font-bold">
            {isLoading ? 'Processing...' : `Upgrade to ${TIERS[selectedTier].name}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Restore */}
      <TouchableOpacity
        className="w-full py-[12px] items-center"
        onPress={handleRestore}
      >
        <Text className="text-on-surface-variant text-[16px]">Restore Purchases</Text>
      </TouchableOpacity>

      <Text className="text-outline text-[12px] text-center mt-[16px] leading-[18px]">
        Subscriptions auto-renew. Cancel anytime in your device settings.
      </Text>
    </ScrollView>
  );
}

const FeatureItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View className="flex-row items-center">
    <MaterialIcons name={icon as any} size={20} color="#6c5ce7" style={{ marginRight: 12 }} />
    <Text className="text-[16px] text-on-surface">{text}</Text>
  </View>
);

const FeatureCard: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <View className="flex-row items-start bg-surface-container-low/50 p-[12px] rounded-xl border border-white/5">
    <View className="w-8 h-8 rounded-full bg-secondary/20 items-center justify-center mr-[12px]">
      <MaterialIcons name={icon as any} size={18} color="#f4be4e" />
    </View>
    <View className="flex-1">
      <Text className="text-[16px] text-on-surface mb-[2px]">{title}</Text>
      <Text className="text-[13px] text-on-surface-variant leading-tight">{desc}</Text>
    </View>
  </View>
);
