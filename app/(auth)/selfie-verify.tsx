import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { verifySelfie } from '@/services/verification';
import { StageProgress } from '@/components/ui/StageProgress';
import { InlineError } from '@/components/ui/InlineError';

export default function SelfieVerifyScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { user, loadProfile } = useAuthStore();
  const { ensureCameraPermission } = useCameraPermission();

  const takeSelfie = async () => {
    if (!(await ensureCameraPermission())) {
      setError('Camera permission required. Enable it in Settings to continue.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handleVerify = async () => {
    if (!image || !user) return;
    setLoading(true); setError('');
    const result = await verifySelfie(user.uid, image);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      await loadProfile(user.uid);
      // Navigation is deferred to the success-gated effect below so the
      // timer is cancellable on unmount — manual back-nav or error retry
      // no longer fires a stale `router.replace` against an unmounted
      // screen. (Audit O-12.)
    } else {
      setError(result.error || 'Verification failed');
    }
  };

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => router.replace('/(auth)/id-verify'), 1500);
    return () => clearTimeout(id);
  }, [success]);

  return (
    <View className="flex-1 bg-background">
      {/* Background Ambient Glows */}
      <View className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-primary-container/10 rounded-full opacity-40" />
      <View className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-secondary/5 rounded-full opacity-30" />

      {/* Top App Bar */}
      <View className="absolute top-0 w-full z-50 bg-[#0F0C1A]/80 border-b border-white/10 flex-row justify-between items-center h-16 px-5">
        <TouchableOpacity onPress={() => router.back()} className="p-2 rounded-full">
          <MaterialIcons name="arrow-back" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-white tracking-tighter uppercase">Fuuk'Up</Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <View className="flex-1 w-full max-w-md mx-auto px-[20px] pt-28 pb-10 items-center justify-between z-10">
        {/* Header */}
        <View className="items-center gap-[12px] w-full mt-4">
          <StageProgress current={2} total={3} />
          <Text className="text-[32px] font-bold text-on-surface">Verification</Text>
          <Text className="text-[16px] text-on-surface-variant">Look directly at the camera</Text>
        </View>

        {/* Viewfinder */}
        <View className="w-full max-w-[320px] aspect-square my-[40px] items-center justify-center">
          {/* Gold Viewfinder Ring */}
          <View className="w-full h-full rounded-full border-[3px] border-secondary p-2 items-center justify-center overflow-hidden bg-surface-container-highest/30">
            <View className="w-full h-full rounded-full overflow-hidden bg-black/50 border border-white/5 items-center justify-center">
              {image ? (
                <Image source={{ uri: image }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
              ) : (
                <MaterialIcons name="person" size={80} color="rgba(255,255,255,0.2)" />
              )}
            </View>
          </View>
        </View>

        {/* Action Area */}
        <View className="w-full gap-[24px] items-center mb-8">
          {success && (
            <View className="flex-row items-center gap-2 bg-surface-container/50 border border-white/5 rounded-full px-4 py-2">
              <MaterialIcons name="check-circle" size={16} color="#f4be4e" />
              <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Selfie Verified</Text>
            </View>
          )}

          {!success && (
            <View className="flex-row items-center gap-2 bg-surface-container/50 border border-white/5 rounded-full px-4 py-2">
              <MaterialIcons name="lock" size={16} color="#f4be4e" />
              <Text className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest">Secure Identity Check</Text>
            </View>
          )}

          {error ? (
            <View className="w-full">
              <InlineError message={error} />
            </View>
          ) : null}

          {/* Take Photo Button */}
          <TouchableOpacity
            className="w-full bg-primary-container py-[16px] px-[24px] rounded-xl items-center justify-center flex-row gap-[12px]"
            onPress={takeSelfie}
            activeOpacity={0.8}
          >
            <MaterialIcons name="photo-camera" size={24} color="#faf6ff" />
            <Text className="text-[18px] font-bold text-on-primary-container">{image ? 'Retake Photo' : 'Take Photo'}</Text>
          </TouchableOpacity>

          {/* Verify Button (shown after capture) */}
          {image && !success && (
            <TouchableOpacity
              className="w-full bg-secondary py-[16px] rounded-full items-center"
              onPress={handleVerify}
              disabled={loading}
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              <Text className="text-on-secondary text-[12px] font-bold uppercase tracking-widest">
                {loading ? 'Verifying...' : 'Verify Selfie'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-on-surface-variant/60 text-[16px]">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
