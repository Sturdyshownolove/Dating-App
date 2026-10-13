import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { sendPhoneOTP, registerWithEmail, loginWithEmail } from '@/services/auth';
import { validateEmail, validatePhone, validatePassword } from '@/utils/validation';
import { InlineError } from '@/components/ui/InlineError';

export default function LoginScreen() {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [isRegister, setIsRegister] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setVerificationId, setLastPhoneNumber } = useAuthStore();

  const handlePhoneLogin = async () => {
    if (!validatePhone(phone)) { setError('Enter a valid phone number with country code'); return; }
    setLoading(true); setError('');
    const result = await sendPhoneOTP(phone);
    setLoading(false);
    if (result.success && result.verificationId) {
      setVerificationId(result.verificationId);
      // Capture phone for the OTP screen's Resend button. Without this,
      // Resend has nothing to call sendPhoneOTP with.
      setLastPhoneNumber(phone);
      router.push('/(auth)/otp');
    } else {
      setError(result.error || 'Failed to send OTP');
    }
  };

  const handleEmailAuth = async () => {
    if (!validateEmail(email)) { setError('Enter a valid email'); return; }
    const passCheck = validatePassword(password);
    if (!passCheck.valid) { setError(passCheck.error!); return; }
    setLoading(true); setError('');
    const result = isRegister
      ? await registerWithEmail(email, password)
      : await loginWithEmail(email, password);
    setLoading(false);
    if (result.success) {
      // Route via splash so `correctAuthRoute` (in utils/authStage.ts)
      // sends the user to the right stage based on isProfileComplete /
      // verifiedSelfie / verifiedID. Pre-fix this hard-routed every
      // post-auth user to /profile-setup, flashing returning users
      // through that screen unnecessarily (audit O-2).
      router.replace('/');
    } else {
      setError(result.error || 'Authentication failed');
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Background Ambient Glows */}
        <View className="absolute inset-0 z-0">
          <View className="absolute top-[25%] left-[25%] w-80 h-80 bg-primary-container/20 rounded-full opacity-30" />
          <View className="absolute bottom-[25%] right-[25%] w-72 h-72 bg-secondary/10 rounded-full opacity-20" />
        </View>

        {/* Main Content */}
        <View className="flex-1 relative z-10 items-center justify-center p-[20px]">
          {/* Brand Header */}
          <View className="mb-[40px] items-center">
            <Text className="text-[40px] font-bold tracking-tighter uppercase text-white">Fuuk'Up</Text>
          </View>

          {/* Auth Card (Glassmorphism) */}
          <View className="w-full max-w-sm bg-surface-container-low/60 border border-white/5 rounded-xl p-[24px]">
            {/* Mode Toggle */}
            <View className="flex-row bg-surface-container rounded-xl p-[4px] mb-[24px]">
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center gap-[6px] py-[12px] rounded-[10px] ${mode === 'phone' ? 'bg-surface-container-high' : ''}`}
                onPress={() => { setMode('phone'); setError(''); }}
              >
                <MaterialIcons name="phone" size={18} color={mode === 'phone' ? '#c6bfff' : '#928ea0'} />
                <Text className={`text-[16px] font-medium ${mode === 'phone' ? 'text-primary' : 'text-outline'}`}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center gap-[6px] py-[12px] rounded-[10px] ${mode === 'email' ? 'bg-surface-container-high' : ''}`}
                onPress={() => { setMode('email'); setError(''); }}
              >
                <MaterialIcons name="email" size={18} color={mode === 'email' ? '#c6bfff' : '#928ea0'} />
                <Text className={`text-[16px] font-medium ${mode === 'email' ? 'text-primary' : 'text-outline'}`}>Email</Text>
              </TouchableOpacity>
            </View>

            {/* Heading */}
            <View className="mb-[24px]">
              <Text className="text-[24px] font-semibold text-on-surface mb-[4px]">
                {isRegister ? 'Create Account' : 'Welcome Back'}
              </Text>
              <Text className="text-[16px] text-on-surface-variant">
                {mode === 'phone' ? 'Sign in with your phone number' : isRegister ? 'Create your account with email' : 'Sign in with your email'}
              </Text>
            </View>

            {/* Error */}
            {error ? (
              <View className="mb-[16px]">
                <InlineError message={error} />
              </View>
            ) : null}

            {/* Phone Mode */}
            {mode === 'phone' ? (
              <View className="gap-[16px]">
                <View>
                  <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-[8px]">Phone Number</Text>
                  <TextInput
                    className="bg-surface-container/50 border-b-2 border-inverse-primary text-on-surface text-[16px] rounded-t-[4px] px-[16px] py-[14px]"
                    placeholder="+1 234 567 8900"
                    placeholderTextColor="#928ea0"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
                <TouchableOpacity
                  className="w-full bg-primary-container py-[16px] rounded-xl items-center"
                  onPress={handlePhoneLogin}
                  disabled={loading}
                  style={{ opacity: loading ? 0.6 : 1 }}
                >
                  <Text className="text-on-primary-container text-[16px] font-semibold">
                    {loading ? 'Sending...' : 'Send OTP'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Email Mode */
              <View className="gap-[16px]">
                <View>
                  <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-[8px]">Email</Text>
                  <TextInput
                    className="bg-surface-container/50 border-b-2 border-inverse-primary text-on-surface text-[16px] rounded-t-[4px] px-[16px] py-[14px]"
                    placeholder="your@email.com"
                    placeholderTextColor="#928ea0"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View>
                  <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-[8px]">Password</Text>
                  <TextInput
                    className="bg-surface-container/50 border-b-2 border-inverse-primary text-on-surface text-[16px] rounded-t-[4px] px-[16px] py-[14px]"
                    placeholder="••••••••"
                    placeholderTextColor="#928ea0"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>
                <TouchableOpacity
                  className="w-full bg-primary-container py-[16px] rounded-xl items-center"
                  onPress={handleEmailAuth}
                  disabled={loading}
                  style={{ opacity: loading ? 0.6 : 1 }}
                >
                  <Text className="text-on-primary-container text-[16px] font-semibold">
                    {loading ? 'Loading...' : isRegister ? 'Create Account' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Switch Auth Mode (Email only) */}
            {mode === 'email' && (
              <TouchableOpacity onPress={() => { setIsRegister(!isRegister); setError(''); }} className="mt-[24px] items-center">
                <Text className="text-[16px] text-on-surface-variant">
                  {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                  <Text className="text-primary underline">{isRegister ? 'Sign In' : 'Register'}</Text>
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
