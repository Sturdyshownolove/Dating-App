import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '@/constants/theme';

interface AvatarProps {
  uri: string | null;
  size?: number;
  name?: string;
  showBadge?: boolean;
  badgeColor?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  uri, size = 48, name, showBadge = false, badgeColor = COLORS.success,
}) => {
  const initials = name ? name.charAt(0).toUpperCase() : '?';

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
        </View>
      )}
      {showBadge && (
        <View style={[styles.badge, {
          width: size * 0.25, height: size * 0.25, borderRadius: size * 0.125,
          backgroundColor: badgeColor,
        }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'relative' },
  image: { resizeMode: 'cover' },
  placeholder: {
    backgroundColor: COLORS.cardElevated,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  initials: { color: COLORS.textSecondary, fontWeight: '700' },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    borderWidth: 2, borderColor: COLORS.card,
  },
});
