import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, ViewStyle, TextInputProps } from 'react-native';
import { COLORS, FONTS, FONT_SIZES, RADIUS, SPACING } from '@/constants/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label, error, icon, containerStyle, style, ...props
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[
        styles.inputWrap,
        focused && styles.inputFocused,
        error && styles.inputError,
      ]}>
        {icon && <View style={styles.iconWrap}>{icon}</View>}
        <TextInput
          {...props}
          style={[styles.input, icon ? { paddingLeft: 0 } : undefined, style]}
          placeholderTextColor={COLORS.textMuted}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: SPACING.base },
  label: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.sm,
    fontWeight: '500', marginBottom: SPACING.xs,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING.base,
  },
  inputFocused: { borderColor: COLORS.primary },
  inputError: { borderColor: COLORS.danger },
  iconWrap: { marginRight: SPACING.sm },
  input: {
    flex: 1, color: COLORS.text, fontSize: FONT_SIZES.base,
    paddingVertical: 14,
  },
  error: {
    color: COLORS.danger, fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
  },
});
