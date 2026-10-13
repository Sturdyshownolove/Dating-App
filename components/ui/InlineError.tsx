import React from 'react';
import { View, Text } from 'react-native';

interface InlineErrorProps {
  message?: string | null;
  // Tighter padding for compact contexts (modals, dense forms).
  compact?: boolean;
}

/**
 * Canonical inline error banner. Centralizes the
 * `bg-error-container/30 + rounded + text-error` pattern that was
 * hand-rolled in 7+ places across the auth and settings screens
 * (audit O-16). Returns null when no message so callers can render
 * it unconditionally:
 *
 *     <InlineError message={error} />
 *
 * Pre-component, screens used four different shapes:
 *   - Login: inline `<View bg-error-container>` (this shape)
 *   - OTP: plain `<Text text-error>` (no container)
 *   - Profile-setup: `Alert.alert` (modal)
 *   - Verification screens: small banner (this shape)
 * This component is now the single shape for inline display.
 */
export const InlineError: React.FC<InlineErrorProps> = ({ message, compact }) => {
  if (!message) return null;
  return (
    <View
      className={`bg-error-container/30 rounded-[10px] ${
        compact ? 'p-[10px]' : 'p-[12px]'
      }`}
    >
      <Text className="text-error text-[14px] text-center">{message}</Text>
    </View>
  );
};
