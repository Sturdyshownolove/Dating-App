import React from 'react';
import { View, Text, Image, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT_SIZES, SPACING, RADIUS } from '@/constants/theme';
import { Button } from '@/components/ui/Button';
import { UserProfile } from '@/services/firestore';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

interface MatchModalProps {
  visible: boolean;
  myProfile: UserProfile | null;
  matchedProfile: UserProfile | null;
  onChat: () => void;
  onClose: () => void;
}

export const MatchModal: React.FC<MatchModalProps> = ({
  visible, myProfile, matchedProfile, onChat, onClose,
}) => {
  if (!matchedProfile) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View entering={ZoomIn.springify()} style={styles.content}>
          <Animated.Text entering={FadeIn.delay(300)} style={styles.title}>
            It's a Fuuk'Up! 🔥
          </Animated.Text>
          <View style={styles.avatars}>
            <View style={styles.avatarWrap}>
              <Image source={{ uri: myProfile?.photos?.[0] }} style={styles.avatar} />
            </View>
            <View style={styles.heart}>
              <Text style={styles.heartEmoji}>💜</Text>
            </View>
            <View style={styles.avatarWrap}>
              <Image source={{ uri: matchedProfile?.photos?.[0] }} style={styles.avatar} />
            </View>
          </View>
          <Text style={styles.subtitle}>
            You and {matchedProfile.name} liked each other
          </Text>
          <Text style={styles.timerNote}>⏰ The clock is ticking — make it count!</Text>
          <View style={styles.buttons}>
            <Button title="Send a Message" onPress={onChat} variant="primary" size="lg" />
            <Button title="Keep Swiping" onPress={onClose} variant="outline" size="md" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,12,26,0.92)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  content: { alignItems: 'center', width: '100%' },
  title: {
    color: COLORS.primary, fontSize: FONT_SIZES['5xl'],
    fontWeight: '900', marginBottom: 32, textAlign: 'center',
  },
  avatars: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  avatarWrap: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 3,
    borderColor: COLORS.primary, overflow: 'hidden',
  },
  avatar: { width: '100%', height: '100%' },
  heart: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.card,
    justifyContent: 'center', alignItems: 'center', marginHorizontal: -12, zIndex: 1,
    borderWidth: 2, borderColor: COLORS.primary,
  },
  heartEmoji: { fontSize: 20 },
  subtitle: {
    color: COLORS.text, fontSize: FONT_SIZES.lg,
    fontWeight: '600', marginBottom: 8, textAlign: 'center',
  },
  timerNote: {
    color: COLORS.textSecondary, fontSize: FONT_SIZES.md,
    marginBottom: 32, textAlign: 'center',
  },
  buttons: { width: '100%', gap: 12 },
});
