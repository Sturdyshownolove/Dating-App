import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { COLORS, FONT_SIZES } from '@/constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        {message && <Text style={styles.text}>{message}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  box: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 32, alignItems: 'center', gap: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  text: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
});
