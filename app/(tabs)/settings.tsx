import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Share, Linking, Modal, TextInput } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/authStore';
import { TIERS } from '@/constants/tiers';
import { InlineError } from '@/components/ui/InlineError';
import {
  deleteAccount,
  exportAccount,
  reauthenticateWithPassword,
  reauthenticateWithPhone,
  isEmailMethodUser,
  sendPhoneOTP,
} from '@/services/auth';

export default function SettingsScreen() {
  const { user, profile, logout } = useAuthStore();
  // Tier reads from profile (authoritative). usePremiumStore no longer
  // mirrors it; see store/premiumStore.ts for the rationale.
  const tierConfig = TIERS[profile?.tierLevel ?? 'FREE'];
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Re-auth gate state machine. Inner gate after the outer Alert.alert
  // confirmation; email users enter password, phone users complete an
  // OTP challenge. Phase 1 = email; phase 2 = phone (this iteration).
  type ReauthMode = 'closed' | 'email' | 'phone-send' | 'phone-verify';
  const [reauthMode, setReauthMode] = useState<ReauthMode>('closed');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthOtpCode, setReauthOtpCode] = useState('');
  const [reauthVerificationId, setReauthVerificationId] = useState<string | null>(null);
  const [reauthError, setReauthError] = useState('');
  const [reauthing, setReauthing] = useState(false);

  const closeReauthModal = () => {
    setReauthMode('closed');
    setReauthPassword('');
    setReauthOtpCode('');
    setReauthVerificationId(null);
    setReauthError('');
  };

  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    const result = await exportAccount();
    setExporting(false);
    if (!result.success) {
      Alert.alert('Export failed', result.error);
      return;
    }
    // Two delivery paths:
    //  - `inline`: payload fits the callable response cap → share JSON
    //    text via the OS share sheet.
    //  - `signed URL`: payload too big for inline → CF wrote to
    //    Storage and returned a 1h-TTL signed URL; open it in the
    //    browser so the user can download.
    if (result.data.inline) {
      try {
        await Share.share({
          title: "Fuuk'Up data export",
          message: JSON.stringify(result.data.data, null, 2),
        });
      } catch {
        // User dismissed — not an error.
      }
    } else {
      // Capture in the narrowed scope so the Alert callback closes over
      // a plain string instead of the discriminated union.
      const downloadUrl = result.data.url;
      Alert.alert(
        'Data ready',
        'Your data export is ready to download. The link expires in 1 hour.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => Linking.openURL(downloadUrl) },
        ]
      );
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const runDeleteAccount = async () => {
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (!result.success) {
      Alert.alert(
        'Deletion incomplete',
        result.error ||
          'Some data could not be removed. Please try again, or contact support if this continues.'
      );
    }
    // On success, the auth state change drains us to onboarding.
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Email users enter their password; phone users complete
            // an OTP challenge against the phone number on their auth
            // record. Both paths converge on `runDeleteAccount` after
            // a successful `reauthenticateWithCredential`.
            setReauthError('');
            setReauthPassword('');
            setReauthOtpCode('');
            setReauthVerificationId(null);
            setReauthMode(isEmailMethodUser() ? 'email' : 'phone-send');
          },
        },
      ]
    );
  };

  const handleEmailReauthSubmit = async () => {
    if (reauthing) return;
    setReauthing(true);
    setReauthError('');
    const result = await reauthenticateWithPassword(reauthPassword);
    setReauthing(false);
    if (!result.success) {
      setReauthError(result.error ?? 'Re-authentication failed');
      return;
    }
    closeReauthModal();
    await runDeleteAccount();
  };

  const handlePhoneSendCode = async () => {
    if (reauthing) return;
    const phone = user?.phoneNumber;
    if (!phone) {
      setReauthError('No phone number on this account.');
      return;
    }
    setReauthing(true);
    setReauthError('');
    const result = await sendPhoneOTP(phone);
    setReauthing(false);
    if (!result.success || !result.verificationId) {
      setReauthError(result.error ?? 'Failed to send code');
      return;
    }
    setReauthVerificationId(result.verificationId);
    setReauthMode('phone-verify');
  };

  const handlePhoneOtpSubmit = async () => {
    if (reauthing || !reauthVerificationId) return;
    if (reauthOtpCode.length !== 6) {
      setReauthError('Enter the 6-digit code');
      return;
    }
    setReauthing(true);
    setReauthError('');
    const result = await reauthenticateWithPhone(reauthVerificationId, reauthOtpCode);
    setReauthing(false);
    if (!result.success) {
      setReauthError(result.error ?? 'Re-authentication failed');
      return;
    }
    closeReauthModal();
    await runDeleteAccount();
  };

  return (
    <>
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: 56, paddingBottom: 60 }}>
      {/* Profile Header */}
      <View className="items-center py-[24px]">
        <Avatar uri={profile?.photos?.[0] || null} name={profile?.name} size={80} />
        <Text className="text-[28px] font-bold text-on-surface mt-[12px]">{profile?.name || 'User'}</Text>
        <Text className="text-[16px] text-on-surface-variant mt-[4px]">{profile?.age} • {profile?.gender}</Text>
        <View className="flex-row gap-[8px] mt-[8px]">
          {profile?.verifiedSelfie && (
            <View className="flex-row items-center gap-[4px] bg-surface-container rounded-full px-[10px] py-[4px] border border-white/5">
              <MaterialIcons name="check-circle" size={14} color="#4ade80" />
              <Text className="text-[12px] text-[#4ade80] font-medium">Selfie ✓</Text>
            </View>
          )}
          {profile?.verifiedID && (
            <View className="flex-row items-center gap-[4px] bg-surface-container rounded-full px-[10px] py-[4px] border border-white/5">
              <MaterialIcons name="check-circle" size={14} color="#4ade80" />
              <Text className="text-[12px] text-[#4ade80] font-medium">ID ✓</Text>
            </View>
          )}
        </View>
      </View>

      {/* Subscription */}
      <TouchableOpacity
        className="mx-[16px] mb-[8px] bg-surface-container-low/60 rounded-lg p-[8px] border border-white/5"
        onPress={() => router.push('/(tabs)/premium')}
      >
        <View className="flex-row items-center gap-[12px]">
          <MaterialIcons name="diamond" size={22} color="#f4be4e" />
          <View className="flex-1">
            <Text className="text-[16px] text-on-surface font-semibold">Subscription</Text>
            <Text className="text-[14px] text-on-surface-variant mt-[2px]">{tierConfig.name} — {tierConfig.durationLabel} timer</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#928ea0" />
        </View>
      </TouchableOpacity>

      {/* Settings Items */}
      <SettingsItem
        icon="person-outline"
        title="Edit Profile"
        onPress={() => router.push('/(auth)/profile-setup?edit=1' as never)}
      />
      <SettingsItem icon="notifications-none" title="Notifications" onPress={() => {}} />
      <SettingsItem icon="location-on" title="Location Settings" onPress={() => {}} />
      <SettingsItem icon="shield" title="Privacy & Safety" onPress={() => {}} />
      <SettingsItem icon="help-outline" title="Help & Support" onPress={() => {}} />
      <SettingsItem icon="description" title="Terms of Service" onPress={() => {}} />
      <SettingsItem icon="lock-outline" title="Privacy Policy" onPress={() => {}} />
      <SettingsItem
        icon="download"
        title={exporting ? 'Preparing export…' : 'Export My Data'}
        onPress={handleExportData}
      />

      {/* Danger Zone */}
      <View className="p-[24px] gap-[16px] mt-[16px]">
        <TouchableOpacity
          className="w-full py-[14px] rounded-xl border border-outline-variant items-center"
          onPress={handleLogout}
        >
          <Text className="text-on-surface text-[16px]">Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={deleting}
          className="items-center py-[12px]"
          style={{ opacity: deleting ? 0.5 : 1 }}
        >
          <Text className="text-error text-[16px] font-medium">
            {deleting ? 'Deleting…' : 'Delete Account'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text className="text-outline text-[12px] text-center mb-[20px]">Fuuk'Up v1.0.0</Text>
    </ScrollView>

    {/* Re-auth modal — gates deleteAccount. Email users enter password
        (S1-10 phase 1); phone users complete an OTP challenge against
        their phone number on the auth record (S1-10 phase 2). */}
    <Modal
      visible={reauthMode !== 'closed'}
      transparent
      animationType="fade"
      onRequestClose={() => !reauthing && closeReauthModal()}
    >
      <View className="flex-1 bg-black/70 items-center justify-center px-[24px]">
        <View className="w-full max-w-sm bg-surface-container-low border border-white/10 rounded-2xl p-[20px]">
          {reauthMode === 'email' && (
            <>
              <Text className="text-[18px] font-semibold text-on-surface mb-[8px]">
                Confirm your password
              </Text>
              <Text className="text-[14px] text-on-surface-variant mb-[16px]">
                Re-enter your password to permanently delete your account.
              </Text>
              <TextInput
                value={reauthPassword}
                onChangeText={setReauthPassword}
                secureTextEntry
                autoCapitalize="none"
                autoFocus
                placeholder="Password"
                placeholderTextColor="#928ea0"
                className="bg-surface-container/50 border-b-2 border-inverse-primary text-on-surface text-[16px] rounded-t-[4px] px-[14px] py-[12px] mb-[12px]"
              />
            </>
          )}

          {reauthMode === 'phone-send' && (
            <>
              <Text className="text-[18px] font-semibold text-on-surface mb-[8px]">
                Verify it's you
              </Text>
              <Text className="text-[14px] text-on-surface-variant mb-[16px]">
                We'll send a 6-digit code to{' '}
                <Text className="text-on-surface">{user?.phoneNumber ?? 'your phone'}</Text>{' '}
                to confirm this deletion.
              </Text>
            </>
          )}

          {reauthMode === 'phone-verify' && (
            <>
              <Text className="text-[18px] font-semibold text-on-surface mb-[8px]">
                Enter the code
              </Text>
              <Text className="text-[14px] text-on-surface-variant mb-[16px]">
                We sent a 6-digit code to {user?.phoneNumber ?? 'your phone'}.
              </Text>
              <TextInput
                value={reauthOtpCode}
                onChangeText={(t) => setReauthOtpCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                placeholder="123456"
                placeholderTextColor="#928ea0"
                className="bg-surface-container/50 border-b-2 border-inverse-primary text-on-surface text-[18px] text-center tracking-widest rounded-t-[4px] px-[14px] py-[12px] mb-[12px]"
              />
            </>
          )}

          {reauthError ? (
            <View className="mb-[12px]">
              <InlineError message={reauthError} compact />
            </View>
          ) : null}

          <View className="flex-row gap-[12px] mt-[4px]">
            <TouchableOpacity
              onPress={() => !reauthing && closeReauthModal()}
              disabled={reauthing}
              className="flex-1 py-[12px] rounded-xl border border-outline-variant items-center"
            >
              <Text className="text-on-surface text-[14px]">Cancel</Text>
            </TouchableOpacity>

            {reauthMode === 'email' && (
              <TouchableOpacity
                onPress={handleEmailReauthSubmit}
                disabled={reauthing || reauthPassword.length === 0}
                className="flex-1 py-[12px] rounded-xl bg-error items-center"
                style={{ opacity: reauthing || reauthPassword.length === 0 ? 0.6 : 1 }}
              >
                <Text className="text-white text-[14px] font-semibold">
                  {reauthing ? 'Verifying…' : 'Delete'}
                </Text>
              </TouchableOpacity>
            )}

            {reauthMode === 'phone-send' && (
              <TouchableOpacity
                onPress={handlePhoneSendCode}
                disabled={reauthing}
                className="flex-1 py-[12px] rounded-xl bg-primary-container items-center"
                style={{ opacity: reauthing ? 0.6 : 1 }}
              >
                <Text className="text-on-primary-container text-[14px] font-semibold">
                  {reauthing ? 'Sending…' : 'Send code'}
                </Text>
              </TouchableOpacity>
            )}

            {reauthMode === 'phone-verify' && (
              <TouchableOpacity
                onPress={handlePhoneOtpSubmit}
                disabled={reauthing || reauthOtpCode.length !== 6}
                className="flex-1 py-[12px] rounded-xl bg-error items-center"
                style={{ opacity: reauthing || reauthOtpCode.length !== 6 ? 0.6 : 1 }}
              >
                <Text className="text-white text-[14px] font-semibold">
                  {reauthing ? 'Verifying…' : 'Delete'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const SettingsItem: React.FC<{ icon: string; title: string; onPress: () => void }> = ({ icon, title, onPress }) => (
  <TouchableOpacity
    className="flex-row items-center gap-[14px] py-[14px] px-[20px] border-b border-white/5"
    onPress={onPress}
    activeOpacity={0.7}
  >
    <MaterialIcons name={icon as any} size={22} color="#c8c4d7" />
    <Text className="flex-1 text-on-surface text-[16px]">{title}</Text>
    <MaterialIcons name="chevron-right" size={18} color="#928ea0" />
  </TouchableOpacity>
);
