import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING, RADIUS } from '@/constants/theme';
import { Match, UserProfile } from '@/services/firestore';
import { Avatar } from '@/components/ui/Avatar';
import { Timer } from '@/components/ui/Timer';
import { formatRelativeTime } from '@/utils/time';

interface MatchCardProps {
  match: Match;
  partner: UserProfile | undefined;
  onPress: () => void;
}

export const MatchCard: React.FC<MatchCardProps> = ({ match, partner, onPress }) => {
  const isExpired = !match.isActive || match.isBlocked || new Date() > match.expiresAt;
  return (
    <TouchableOpacity style={[styles.card, isExpired && styles.expired]} onPress={onPress} activeOpacity={0.7}>
      <Avatar uri={partner?.photos?.[0] || null} name={partner?.name} size={56}
        showBadge={!isExpired} badgeColor={isExpired ? COLORS.textMuted : COLORS.success} />
      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={[styles.name, isExpired && { color: COLORS.textMuted }]}>{partner?.name || '...'}</Text>
          {match.lastMessageAt && <Text style={styles.time}>{formatRelativeTime(match.lastMessageAt)}</Text>}
        </View>
        {isExpired ? (
          <Text style={styles.expiredText}>⏰ Expired</Text>
        ) : (
          <Timer expiresAt={match.expiresAt} size="sm" />
        )}
        {match.lastMessage ? <Text style={styles.lastMsg} numberOfLines={1}>{match.lastMessage}</Text> : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.base,
    marginHorizontal: SPACING.base, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  expired: { opacity: 0.5 },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: COLORS.text, fontSize: FONT_SIZES.base, fontWeight: '600' },
  time: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },
  expiredText: { color: COLORS.danger, fontSize: FONT_SIZES.xs, marginTop: 2 },
  lastMsg: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, marginTop: 4 },
});
