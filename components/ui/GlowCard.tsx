import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/constants/theme';

interface GlowCardProps {
  children: React.ReactNode;
  glowColor?: string;
  style?: ViewStyle;
  elevated?: boolean;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children, glowColor = COLORS.primaryGlow, style, elevated = false,
}) => {
  return (
    <View style={[
      styles.card,
      elevated && styles.elevated,
      SHADOWS.glow(glowColor),
      style,
    ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  elevated: {
    backgroundColor: COLORS.cardElevated,
  },
});
