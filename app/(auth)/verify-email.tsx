import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import auth from '@react-native-firebase/auth';
import { useAuthStore } from '@/store/authStore';
import { resendEmailVerification, reloadFirebaseUser, signOut } from '@/services/auth';
import { InlineError } from '@/components/ui/InlineError';

// Defense-in-depth caps. Matches the OTP screen's shape.
//   - Resend cooldown: 60 s. Twilio-recommended pattern for email
//     verification; long enough to discourage abuse, short enough that
//     a legitimate user who didn't get the email isn't blocked.
//   - Reload poll: every 5 s. Picks up emailVerified=true after the
//     user clicks the link in another app, without spamming the
//     Firebase user/get endpoint.
const RESEND_COOLDOWN_S = 60;
const RELOAD_POLL_MS = 5_000;

export default function VerifyEmailScreen() {
  const { user, emailVerified, setEmailVerified } = useAuthStore();
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const [error, setError] = useState('');

  // Resend cooldown tick — initial cooldown blocks immediate Resend
  // after landing on the screen (the initial verification email was
  // sent during register, so there's no need for an instant retry).
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Reload poll. Each tick refreshes the Firebase user from the server
  // and pushes the updated emailVerified into the auth store. When it
  // flips to true, the (auth)/_layout guard auto-routes the user
  // forward. Note: `user.reload()` updates currentUser in place but
  // does NOT fire `onAuthStateChanged`, so we have to explicitly
  // mirror the new value via `setEmailVerified`.
  useEffect(() => {
    if (emailVerified) return;
    const t = setInterval(async () => {
      await reloadFirebaseUser();
      const verified = auth().currentUser?.emailVerified ?? false;
      if (verified) setEmailVerified(true);
    }, RELOAD_POLL_MS);
    return () => clearInterval(t);
  }, [emailVerified, setEmailVerified]);

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError('');
    const result = await resendEmailVerification();
    setResending(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to resend');
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_S);
  };

  const handleSignOut = async () => {
    // Escape hatch: user wants to sign out instead of verifying. The
    // (auth) layout guard will route them back to /(auth)/onboarding
    // after signOut clears the store.
    await signOut();
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-full max-w-sm bg-surface-container-low/60 border border-white/10 rounded-2xl p-[24px]">
          <View className="items-center mb-[20px]">
            <View className="w-16 h-16 rounded-full bg-primary-container/20 items-center justify-center mb-[12px]">
              <MaterialIcons name="mark-email-unread" size={32} color="#c6bfff" />
            </View>
            <Text className="text-[24px] font-semibold text-on-surface text-center">
              Verify your email
            </Text>
            <Text className="text-[14px] text-on-surface-variant text-center mt-[8px]">
              We sent a verification link to
            </Text>
            <Text className="text-[14px] text-primary text-center mt-[4px]">
              {user?.email ?? 'your address'}
            </Text>
            <Text className="text-[13px] text-on-surface-variant text-center mt-[12px]">
              Click the link in your email to continue. This screen
              will advance automatically.
            </Text>
          </View>

          {error ? (
            <View className="mb-[12px]">
              <InlineError message={error} compact />
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || resending}
            className="w-full bg-primary-container py-[14px] rounded-xl items-center"
            style={{ opacity: resendCooldown > 0 || resending ? 0.5 : 1 }}
          >
            <Text className="text-on-primary-container text-[15px] font-semibold">
              {resending
                ? 'Sending…'
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend email'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSignOut} className="mt-[16px] items-center py-[10px]">
            <Text className="text-on-surface-variant text-[14px]">Sign out and use a different account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
