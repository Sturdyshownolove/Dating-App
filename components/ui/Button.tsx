import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SPACING } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'premium' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, icon, style, textStyle, fullWidth = true,
}) => {
  const isDisabled = disabled || loading;

  const sizeStyles = {
    sm: { paddingVertical: 10, paddingHorizontal: 16, fontSize: FONT_SIZES.sm },
    md: { paddingVertical: 14, paddingHorizontal: 24, fontSize: FONT_SIZES.base },
    lg: { paddingVertical: 18, paddingHorizontal: 32, fontSize: FONT_SIZES.lg },
  };

  const getGradient = (): [string, string] => {
    switch (variant) {
      case 'premium': return [COLORS.premium, COLORS.premiumDark];
      case 'danger': return [COLORS.danger, '#CC5555'];
      default: return [COLORS.primary, COLORS.primaryDark];
    }
  };

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        style={[styles.base, {
          borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: 'transparent',
          paddingVertical: sizeStyles[size].paddingVertical,
          paddingHorizontal: sizeStyles[size].paddingHorizontal,
          opacity: isDisabled ? 0.5 : 1, width: fullWidth ? '100%' : undefined,
        }, style]}
      >
        {icon}
        {loading ? <ActivityIndicator color={COLORS.primary} /> :
          <Text style={[styles.text, { color: COLORS.primary, fontSize: sizeStyles[size].fontSize }, textStyle]}>
            {title}
          </Text>}
      </TouchableOpacity>
    );
  }

  if (variant === 'secondary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        style={[styles.base, {
          backgroundColor: COLORS.cardElevated,
          paddingVertical: sizeStyles[size].paddingVertical,
          paddingHorizontal: sizeStyles[size].paddingHorizontal,
          opacity: isDisabled ? 0.5 : 1, width: fullWidth ? '100%' : undefined,
        }, style]}
      >
        {icon}
        {loading ? <ActivityIndicator color={COLORS.text} /> :
          <Text style={[styles.text, { fontSize: sizeStyles[size].fontSize }, textStyle]}>{title}</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} activeOpacity={0.8}
      style={[{ width: fullWidth ? '100%' : undefined, opacity: isDisabled ? 0.5 : 1 }, style]}>
      <LinearGradient colors={getGradient()} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.base, styles.gradient, {
          paddingVertical: sizeStyles[size].paddingVertical,
          paddingHorizontal: sizeStyles[size].paddingHorizontal,
        }]}>
        {icon}
        {loading ? <ActivityIndicator color="#fff" /> :
          <Text style={[styles.text, {
            fontSize: sizeStyles[size].fontSize,
            color: variant === 'premium' ? '#1A1333' : '#fff',
          }, textStyle]}>{title}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  gradient: { borderRadius: RADIUS.lg },
  text: { fontWeight: '600', textAlign: 'center' },
});
