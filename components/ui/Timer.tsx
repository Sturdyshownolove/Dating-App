import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING } from '@/constants/theme';
import { useTimer } from '@/hooks/useTimer';

interface TimerProps {
  expiresAt: Date;
  totalDuration?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  onExpire?: () => void;
}

export const Timer: React.FC<TimerProps> = ({
  expiresAt, totalDuration, size = 'md', showLabel = false, onExpire,
}) => {
  const { formatted, isExpired, percentage, color, remaining } = useTimer(expiresAt, totalDuration);

  React.useEffect(() => {
    if (isExpired && onExpire) onExpire();
  }, [isExpired]);

  const sizeConfig = {
    sm: { fontSize: FONT_SIZES.sm, dotSize: 6, padding: 6 },
    md: { fontSize: FONT_SIZES.xl, dotSize: 8, padding: 10 },
    lg: { fontSize: FONT_SIZES['4xl'], dotSize: 10, padding: 14 },
  };

  const cfg = sizeConfig[size];
  const isPulsing = remaining < 300 && remaining > 0; // < 5 min

  return (
    <View style={[styles.container, { padding: cfg.padding }]}>
      <View style={styles.row}>
        <View style={[styles.dot, {
          width: cfg.dotSize, height: cfg.dotSize,
          backgroundColor: isExpired ? COLORS.textMuted : color,
          ...(isPulsing ? { opacity: 0.8 } : {}),
        }]} />
        <Text style={[styles.time, {
          fontSize: cfg.fontSize,
          color: isExpired ? COLORS.textMuted : color,
        }]}>
          {isExpired ? 'EXPIRED' : formatted}
        </Text>
      </View>
      {showLabel && !isExpired && (
        <Text style={styles.label}>remaining</Text>
      )}
      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, {
          width: `${Math.max(percentage * 100, 0)}%`,
          backgroundColor: color,
        }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dot: { borderRadius: 99 },
  time: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, marginTop: 2 },
  progressBg: {
    width: '100%', height: 3, backgroundColor: COLORS.border,
    borderRadius: 2, marginTop: SPACING.xs, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
});
