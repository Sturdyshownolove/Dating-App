import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING, RADIUS } from '@/constants/theme';

interface MessageBubbleProps {
  text: string;
  imageUrl?: string | null;
  isMine: boolean;
  time: string;
  seen?: boolean;
  isLast?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  text, imageUrl, isMine, time, seen, isLast,
}) => {
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[
        styles.bubble,
        isMine ? styles.bubbleMine : styles.bubbleTheirs,
        imageUrl && styles.imageBubble,
      ]}>
        {imageUrl && (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        )}
        {text ? <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>{text}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.time}>{time}</Text>
          {isMine && isLast && (
            <Text style={[styles.seen, seen && styles.seenActive]}>
              {seen ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { marginVertical: 2, paddingHorizontal: SPACING.base },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '78%', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.cardElevated,
    borderBottomLeftRadius: 4,
  },
  imageBubble: { padding: 4 },
  image: {
    width: 200, height: 200, borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },
  text: { fontSize: FONT_SIZES.md, lineHeight: 20 },
  textMine: { color: '#FFFFFF' },
  textTheirs: { color: COLORS.text },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 2 },
  time: { color: 'rgba(255,255,255,0.5)', fontSize: FONT_SIZES.xs },
  seen: { color: 'rgba(255,255,255,0.4)', fontSize: FONT_SIZES.xs },
  seenActive: { color: COLORS.success },
});
