import React, { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, RADIUS, SPACING } from '@/constants/theme';

interface ChatInputProps {
  onSend: (text: string) => void;
  onSendImage: (uri: string) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend, onSendImage, onTyping, disabled = false,
}) => {
  const [text, setText] = useState('');
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChangeText = (val: string) => {
    setText(val);
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 3000);
  };

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    onTyping(false);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      onSendImage(result.assets[0].uri);
    }
  };

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <TouchableOpacity onPress={handlePickImage} disabled={disabled} style={styles.iconBtn}>
        <Ionicons name="image-outline" size={24} color={disabled ? COLORS.textMuted : COLORS.primary} />
      </TouchableOpacity>
      <TextInput
        value={text}
        onChangeText={handleChangeText}
        placeholder={disabled ? 'Chat locked' : 'Type a message...'}
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        editable={!disabled}
        multiline
        maxLength={1000}
      />
      <TouchableOpacity
        onPress={handleSend}
        disabled={!text.trim() || disabled}
        style={[styles.sendBtn, text.trim() && !disabled && styles.sendBtnActive]}
      >
        <Ionicons name="send" size={20}
          color={text.trim() && !disabled ? '#fff' : COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: SPACING.xs,
  },
  disabled: { opacity: 0.5 },
  iconBtn: { padding: SPACING.sm },
  input: {
    flex: 1, color: COLORS.text, fontSize: 15,
    backgroundColor: COLORS.cardElevated, borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.base, paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.cardElevated,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnActive: { backgroundColor: COLORS.primary },
});
