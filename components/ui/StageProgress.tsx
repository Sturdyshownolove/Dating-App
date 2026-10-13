import React from 'react';
import { View, Text } from 'react-native';

interface StageProgressProps {
  current: number;
  total: number;
}

/**
 * Compact "Step X of Y" header used in the verification funnel
 * (profile-setup → selfie-verify → id-verify). Reduces completion
 * drop-off by showing the user how many steps remain (audit O-11).
 *
 * verify-email is intentionally NOT counted — it's a one-shot
 * "check your inbox" wait screen rather than a funnel step.
 */
export const StageProgress: React.FC<StageProgressProps> = ({ current, total }) => {
  return (
    <View className="items-center mb-[16px]">
      <Text className="text-[11px] font-bold tracking-widest text-on-surface-variant uppercase mb-[6px]">
        Step {current} of {total}
      </Text>
      <View className="flex-row gap-[6px]">
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={`h-[3px] w-[28px] rounded-full ${
              i < current ? 'bg-primary' : 'bg-surface-container-highest'
            }`}
          />
        ))}
      </View>
    </View>
  );
};
