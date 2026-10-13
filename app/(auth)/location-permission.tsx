import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useLocation } from '@/hooks/useLocation';
import { markLocationPrompted } from '@/services/firestore';
import { InlineError } from '@/components/ui/InlineError';

/**
 * Location permission stage (audit O-7). Placed at the end of the
 * verification funnel so the user has already invested in completing
 * profile + selfie + ID — they're much more likely to grant location
 * here than they would have been upfront.
 *
 * Allow → useLocation.requestLocation() (which fires the OS prompt
 * and on grant writes city to the user doc + precise coords to
 * `users/{uid}/private/location` via the split established in
 * security_location_private_subcollection_2026-05-24).
 * Skip → no permission requested; user can change mind via Settings
 * → Location Settings.
 *
 * Either path marks `locationPromptedAt` so the gate doesn't
 * re-pester. Routes via `/` so the splash + gate handle the next
 * stage (which by definition is /(tabs) since this is the final
 * onboarding stage).
 */
export default function LocationPermissionScreen() {
  const { user } = useAuthStore();
  const { requestLocation, loading: locating, error: locationError } = useLocation(user?.uid);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const finish = async () => {
    if (!user) return;
    setSubmitting(true);
    setError('');
    const ok = await markLocationPrompted(user.uid);
    setSubmitting(false);
    if (!ok) {
      setError('Could not save your choice. Please try again.');
      return;
    }
    router.replace('/');
  };

  const handleAllow = async () => {
    if (submitting || locating || !user) return;
    // requestLocation fires the OS prompt + (on grant) writes
    // city + private coords. If the user denies the OS prompt,
    // useLocation surfaces a setError internally but the await
    // resolves either way — we still mark prompted so the gate
    // moves on.
    await requestLocation();
    await finish();
  };

  const handleSkip = async () => {
    await finish();
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 }}>
      <View className="flex-1 max-w-md w-full mx-auto justify-center">
        <View className="items-center mb-[24px]">
          <View className="w-16 h-16 rounded-full bg-primary-container/20 items-center justify-center mb-[12px]">
            <MaterialIcons name="explore" size={32} color="#c6bfff" />
          </View>
          <Text className="text-[24px] font-semibold text-on-surface text-center">
            One last thing
          </Text>
          <Text className="text-[16px] text-on-surface-variant text-center mt-[8px] px-[16px]">
            Share your location so we can show you matches nearby. Your
            precise coordinates stay private — only your city is shown
            on your profile.
          </Text>
        </View>

        <View className="bg-surface-container-low/60 border border-white/10 rounded-xl p-[16px] mb-[16px]">
          <View className="flex-row items-start gap-[10px] mb-[8px]">
            <MaterialIcons name="lock" size={18} color="#c6bfff" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[13px] text-on-surface-variant leading-5">
              Lat/long live in an owner-only doc that even other
              FuukUp users can't read.
            </Text>
          </View>
          <View className="flex-row items-start gap-[10px]">
            <MaterialIcons name="settings" size={18} color="#c6bfff" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[13px] text-on-surface-variant leading-5">
              You can change this any time in Settings → Location Settings.
            </Text>
          </View>
        </View>

        {error || locationError ? (
          <View className="mb-[12px]">
            <InlineError message={error || locationError} compact />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleAllow}
          disabled={submitting || locating}
          className="w-full bg-primary-container py-[14px] rounded-xl items-center"
          style={{ opacity: submitting || locating ? 0.6 : 1 }}
        >
          <Text className="text-on-primary-container text-[16px] font-semibold">
            {locating ? 'Requesting…' : submitting ? 'Saving…' : 'Allow location access'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSkip}
          disabled={submitting || locating}
          className="w-full py-[12px] items-center mt-[8px]"
        >
          <Text className="text-on-surface-variant text-[14px]">
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
