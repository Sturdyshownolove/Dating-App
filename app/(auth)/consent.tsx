import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { acceptTerms } from '@/services/firestore';
import { TERMS_VERSION } from '@/utils/authStage';
import { InlineError } from '@/components/ui/InlineError';

/**
 * T&C / privacy / age-confirmation consent (audit O-5 + C-3).
 *
 * One stage, three required checkboxes. All three must be checked
 * before Continue enables. On accept, writes
 * `consent: { version, acceptedAt }` to the user doc and lets the
 * layout guard route to the next stage (profile-setup).
 *
 * Granular per-document version tracking is phase 2 — today's
 * single `version` covers the consent set as a unit. Bump
 * TERMS_VERSION in utils/authStage.ts to re-prompt every user.
 */
export default function ConsentScreen() {
  const { user } = useAuthStore();
  const [age18, setAge18] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const allChecked = age18 && agreeTerms && agreePrivacy;

  const handleContinue = async () => {
    if (!allChecked || submitting || !user) return;
    setSubmitting(true);
    setError('');
    const ok = await acceptTerms(user.uid, TERMS_VERSION);
    setSubmitting(false);
    if (!ok) {
      setError('Could not save your acceptance. Please try again.');
      return;
    }
    // No explicit navigate — the (auth)/_layout guard sees
    // `consent.version >= TERMS_VERSION` on the next render and
    // routes to the next correct stage (profile-setup, etc.).
    router.replace('/');
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1, paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 }}>
      <View className="flex-1 max-w-md w-full mx-auto">
        <View className="items-center mb-[24px]">
          <View className="w-16 h-16 rounded-full bg-primary-container/20 items-center justify-center mb-[12px]">
            <MaterialIcons name="gavel" size={32} color="#c6bfff" />
          </View>
          <Text className="text-[24px] font-semibold text-on-surface text-center">
            Before we continue
          </Text>
          <Text className="text-[14px] text-on-surface-variant text-center mt-[8px]">
            A few quick confirmations required by your region for
            dating-app access.
          </Text>
        </View>

        <ConsentRow
          checked={age18}
          onToggle={() => setAge18((v) => !v)}
          label="I confirm I am 18 years of age or older."
        />

        <ConsentRow
          checked={agreeTerms}
          onToggle={() => setAgreeTerms((v) => !v)}
          label={
            <Text className="text-[14px] text-on-surface leading-5">
              I agree to the{' '}
              <Text
                className="text-primary underline"
                onPress={() => Linking.openURL('https://fuukup.app/terms')}
              >
                Terms of Service
              </Text>
              .
            </Text>
          }
        />

        <ConsentRow
          checked={agreePrivacy}
          onToggle={() => setAgreePrivacy((v) => !v)}
          label={
            <Text className="text-[14px] text-on-surface leading-5">
              I agree to the{' '}
              <Text
                className="text-primary underline"
                onPress={() => Linking.openURL('https://fuukup.app/privacy')}
              >
                Privacy Policy
              </Text>
              , including processing of my profile and verification data.
            </Text>
          }
        />

        {error ? (
          <View className="mt-[12px]">
            <InlineError message={error} compact />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleContinue}
          disabled={!allChecked || submitting}
          className="w-full bg-primary-container py-[14px] rounded-xl items-center mt-[32px]"
          style={{ opacity: !allChecked || submitting ? 0.5 : 1 }}
        >
          <Text className="text-on-primary-container text-[16px] font-semibold">
            {submitting ? 'Saving…' : 'Continue'}
          </Text>
        </TouchableOpacity>

        <Text className="text-on-surface-variant/60 text-[12px] text-center mt-[16px] leading-4">
          Your consent is recorded with a timestamp and version. You can
          request its deletion via the Export / Delete options in
          Settings under GDPR Art. 15 / 17.
        </Text>
      </View>
    </ScrollView>
  );
}

const ConsentRow: React.FC<{
  checked: boolean;
  onToggle: () => void;
  label: React.ReactNode;
}> = ({ checked, onToggle, label }) => (
  <TouchableOpacity
    onPress={onToggle}
    className="flex-row items-start gap-[12px] py-[14px] px-[14px] bg-surface-container-low/60 border border-white/5 rounded-xl mb-[12px]"
    activeOpacity={0.8}
  >
    <View
      className={`w-6 h-6 rounded-md items-center justify-center border-2 ${
        checked ? 'bg-primary-container border-primary-container' : 'border-outline-variant'
      }`}
    >
      {checked && <MaterialIcons name="check" size={18} color="#faf6ff" />}
    </View>
    <View className="flex-1">
      {typeof label === 'string' ? (
        <Text className="text-[14px] text-on-surface leading-5">{label}</Text>
      ) : (
        label
      )}
    </View>
  </TouchableOpacity>
);
