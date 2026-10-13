import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, SPACING, RADIUS } from '@/constants/theme';
import { TierConfig } from '@/constants/tiers';

interface TierCardProps {
  tier: TierConfig;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: () => void;
}

export const TierCard: React.FC<TierCardProps> = ({ tier, isSelected, isCurrent, onSelect }) => {
  const isPremium = tier.id !== 'FREE';
  return (
    <TouchableOpacity onPress={onSelect} activeOpacity={0.8}>
      <View style={[styles.card, isSelected && styles.selected, isCurrent && styles.current]}>
        {tier.id === 'TIER_3' && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>BEST VALUE</Text>
          </View>
        )}
        <Text style={[styles.name, isPremium && { color: COLORS.premium }]}>{tier.name}</Text>
        <Text style={styles.price}>{tier.price}</Text>
        <View style={styles.divider} />
        <View style={styles.features}>
          <FeatureItem icon="timer-outline" label={`${tier.durationLabel} timer`} />
          <FeatureItem icon="swap-horizontal" label={tier.swipesPerDay === Infinity ? 'Unlimited swipes' : `${tier.swipesPerDay} swipes/day`} />
          {tier.boostsPerDay > 0 && <FeatureItem icon="rocket" label={`${tier.boostsPerDay} boost/day`} />}
          {tier.seeLikes && <FeatureItem icon="eye" label="See who liked you" />}
        </View>
        {isCurrent && <Text style={styles.currentLabel}>Current Plan</Text>}
      </View>
    </TouchableOpacity>
  );
};

const FeatureItem: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <View style={styles.featureRow}>
    <Ionicons name={icon as any} size={16} color={COLORS.primary} />
    <Text style={styles.featureText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.xl, padding: SPACING.lg,
    borderWidth: 1.5, borderColor: COLORS.border, marginBottom: SPACING.base, position: 'relative',
  },
  selected: { borderColor: COLORS.primary },
  current: { borderColor: COLORS.success },
  popularBadge: {
    position: 'absolute', top: -10, right: 16,
    backgroundColor: COLORS.premium, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  popularText: { color: '#1A1333', fontSize: 10, fontWeight: '800' },
  name: { color: COLORS.text, fontSize: FONT_SIZES.xl, fontWeight: '700' },
  price: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, marginTop: 4 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },
  features: { gap: SPACING.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  featureText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  currentLabel: { color: COLORS.success, fontSize: FONT_SIZES.xs, fontWeight: '600', marginTop: SPACING.md, textAlign: 'center' },
});
