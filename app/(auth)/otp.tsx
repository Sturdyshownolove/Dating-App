import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { sendPhoneOTP, verifyPhoneOTP } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { InlineError } from '@/components/ui/InlineError';

// Defense-in-depth client caps. The cryptographic brute-force defense is
// Firebase App Check + Play Integrity (project-console config, separate
// task). These caps:
//   - bound SMS-bill exposure on accidental Resend loops
//   - give the legitimate user useful feedback after typos
//   - give the eventual server-side cap a UX hook
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 30;

export default function OTPScreen() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_VERIFY_ATTEMPTS);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_S);
  const { verificationId, lastPhoneNumber, setVerificationId } = useAuthStore();
  const inputs = useRef<(TextInput | null)[]>([]);

  // Start a cooldown on mount so the first Resend can't fire instantly
  // after the initial send from the login screen.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const clearInputs = () => {
    setCode(['', '', '', '', '', '']);
    inputs.current[0]?.focus();
  };

  const handleChange = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
    }
    // Auto-submit when all filled
    if (newCode.every((d) => d) && index === 5) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (otp?: string) => {
    const fullCode = otp || code.join('');
    if (fullCode.length !== 6) { setError('Enter all 6 digits'); return; }
    if (!verificationId) { setError('Session expired. Go back and try again.'); return; }
    if (attemptsLeft <= 0) {
      setError('Too many attempts. Request a new code below.');
      return;
    }
    setLoading(true); setError('');
    const result = await verifyPhoneOTP(verificationId, fullCode);
    setLoading(false);
    if (result.success) {
      // Route via splash so correctAuthRoute steers based on
      // profile state — same shape as login.tsx post-auth.
      router.replace('/');
    } else {
      const next = attemptsLeft - 1;
      setAttemptsLeft(next);
      clearInputs();
      if (next <= 0) {
        setError('Too many attempts. Request a new code below.');
      } else {
        setError(`${result.error || 'Invalid code'} (${next} ${next === 1 ? 'try' : 'tries'} left)`);
      }
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    if (!lastPhoneNumber) {
      setError('Phone number missing — go back and try again.');
      return;
    }
    setResending(true); setError('');
    const result = await sendPhoneOTP(lastPhoneNumber);
    setResending(false);
    if (result.success && result.verificationId) {
      setVerificationId(result.verificationId);
      // Reset client-side caps for the fresh verificationId. The brand-new
      // code is unrelated to attempts spent on the previous one.
      setAttemptsLeft(MAX_VERIFY_ATTEMPTS);
      setResendCooldown(RESEND_COOLDOWN_S);
      clearInputs();
    } else {
      setError(result.error || 'Failed to resend code');
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Luxury Background Element */}
      <View className="absolute inset-0 z-0">
        <LinearGradient
          colors={['rgba(15, 12, 26, 0.6)', 'rgba(26, 19, 51, 0.8)', 'rgba(15, 12, 26, 1)']}
          className="absolute inset-0 z-10"
        />
        <Image
          source={{ uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuDPDZ3rkVHylWTPeYYHcHetUCiawDuhlBOJGoM4d95PlJXL3ZJYhB68iYdsybOysBoVRmzcw6HGwl-OA7EsDRg6lxzh-vjdHJsJWNoACsl174Q2uGBsI8M4q7pk_Y_SDJJCRFX6QoPweD8dLfGSoKj2xKhg3ZNrSyxIeVXBNSD_7p3i2wKAf6T3uKBfRnFL1zPYh3vrqGmRY3bTWF9hM3iI4ZnIxQEzdteYYzxR1LwJgpXogkCqs8mOvme0EWht6XQjl4aZ3DXKcC8U" }}
          className="w-full h-full opacity-40"
          resizeMode="cover"
        />
        {/* Subtle Glow Effects */}
        <View className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-primary-container/20 rounded-full" />
        <View className="absolute bottom-1/4 right-1/4 w-[200px] h-[200px] bg-secondary/10 rounded-full" />
      </View>

      <View className="flex-1 relative z-10 flex-col items-center justify-center p-6">
        {/* Brand Header */}
        <View className="mb-10 text-center items-center">
          <Text className="text-4xl font-bold tracking-tighter uppercase text-white drop-shadow-lg">
            Fuu'k Up
          </Text>
        </View>

        {/* Authentication Card */}
        <View className="w-full max-w-sm bg-surface-container-low/60 border border-white/5 rounded-2xl p-6 shadow-2xl">
          <View className="flex-row items-center justify-between mb-8">
            <TouchableOpacity onPress={() => router.back()} className="p-2">
              <Ionicons name="arrow-back" size={24} color="#c8c4d7" />
            </TouchableOpacity>
            <View className="flex-row space-x-2">
              <View className="w-2 h-2 rounded-full bg-surface-variant mr-2" />
              <View className="w-2 h-2 rounded-full bg-primary" />
            </View>
          </View>

          <View className="mb-8">
            <Text className="text-2xl font-semibold mb-1 text-on-surface">Verification</Text>
            <Text className="text-base text-on-surface-variant">
              Enter the 6-digit code sent to you
            </Text>
          </View>

          {/* OTP Input Fields */}
          <View className="flex-row justify-between mb-8">
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputs.current[i] = ref; }}
                className={`w-11 h-14 bg-surface-container/50 border-b-2 text-center text-2xl font-bold text-on-surface rounded-t-lg transition-all focus:border-primary focus:bg-surface-container-high ${digit ? 'border-primary' : 'border-inverse-primary'}`}
                maxLength={1}
                keyboardType="number-pad"
                value={digit}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? <View className="mb-4"><InlineError message={error} compact /></View> : null}

          {/* Gold Verify Button */}
          <TouchableOpacity
            onPress={() => handleVerify()}
            disabled={loading || attemptsLeft <= 0}
            className="w-full bg-secondary py-4 rounded-full shadow-lg flex-row justify-center items-center active:scale-95 transition-all"
            style={{ opacity: loading || attemptsLeft <= 0 ? 0.6 : 1 }}
          >
            <Text className="text-on-secondary text-xs font-bold tracking-widest uppercase">
              {loading ? 'VERIFYING...' : 'VERIFY'}
            </Text>
          </TouchableOpacity>

          <View className="mt-6 text-center items-center">
            <TouchableOpacity
              className="flex-row"
              onPress={handleResend}
              disabled={resendCooldown > 0 || resending}
            >
              <Text className="text-base text-on-surface-variant">Didn't receive a code? </Text>
              <Text
                className="text-base text-primary underline"
                style={{ opacity: resendCooldown > 0 || resending ? 0.5 : 1 }}
              >
                {resending
                  ? 'Sending...'
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
