import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useCameraPermission } from '@/hooks/useCameraPermission';
import { verifyID } from '@/services/verification';
import { StageProgress } from '@/components/ui/StageProgress';
import { InlineError } from '@/components/ui/InlineError';

export default function IDVerifyScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { user, loadProfile } = useAuthStore();
  const { ensureCameraPermission } = useCameraPermission();

  // Camera-only: gallery picks let a user submit any image of any ID
  // (Google image search result, screenshot, AI-generated forgery) →
  // verification fraud bypass (audit S1-11). The selfie screen already
  // enforces camera-only; this aligns ID with the same posture and is
  // forward-compatible with the planned Persona/Onfido vendor SDK
  // (their SDKs assume live capture).
  const takePhoto = async () => {
    if (!(await ensureCameraPermission())) {
      setError('Camera permission required. Enable it in Settings to continue.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handleVerify = async () => {
    if (!image || !user) return;
    setLoading(true); setError('');
    const result = await verifyID(user.uid, image);
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      await loadProfile(user.uid);
      // Navigation deferred to the success-gated effect below for
      // unmount-safety. (Audit O-12.)
    } else {
      setError(result.error || 'Verification failed');
    }
  };

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => router.replace('/(tabs)'), 1500);
    return () => clearTimeout(id);
  }, [success]);

  return (
    <View className="flex-1 bg-background">
      {/* Top App Bar */}
      <View className="absolute top-0 w-full z-50 bg-[#0F0C1A]/80 border-b border-white/10 flex-row justify-between items-center h-16 px-5">
        <TouchableOpacity onPress={() => router.back()} className="p-2 rounded-full">
          <MaterialIcons name="arrow-back" size={24} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-white tracking-tighter uppercase">Fuuk'Up</Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <View className="flex-1 pt-[88px] pb-[24px] px-[20px] items-center max-w-lg mx-auto w-full">
        {/* Header */}
        <View className="items-center mb-[40px] w-full">
          <StageProgress current={3} total={3} />
          <Text className="text-[32px] font-bold text-on-background mb-[12px]">Verify Identity</Text>
          <Text className="text-[16px] text-on-surface-variant text-center">Position your government ID within the frame to verify your elite status.</Text>
        </View>

        {/* Scanner Area */}
        <View className="w-full aspect-[4/3] rounded-xl overflow-hidden mb-[40px] bg-surface-container-low/50 border border-white/10 items-center justify-center">
          {image ? (
            <Image source={{ uri: image }} className="w-full h-full" style={{ resizeMode: 'cover' }} />
          ) : (
            <View className="w-full h-full items-center justify-center">
              {/* Guide Frame */}
              <View className="w-[80%] h-[60%] border-2 border-secondary/50 rounded-lg items-center justify-center">
                {/* Corner Accents */}
                <View className="absolute -top-[2px] -left-[2px] w-4 h-4 border-t-4 border-l-4 border-secondary rounded-tl-lg" />
                <View className="absolute -top-[2px] -right-[2px] w-4 h-4 border-t-4 border-r-4 border-secondary rounded-tr-lg" />
                <View className="absolute -bottom-[2px] -left-[2px] w-4 h-4 border-b-4 border-l-4 border-secondary rounded-bl-lg" />
                <View className="absolute -bottom-[2px] -right-[2px] w-4 h-4 border-b-4 border-r-4 border-secondary rounded-br-lg" />
                <MaterialIcons name="badge" size={64} color="rgba(244,190,78,0.4)" />
              </View>
              {/* Instruction Overlay */}
              <View className="absolute bottom-4 items-center">
                <View className="flex-row items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high/80 border border-white/5">
                  <View className="w-2 h-2 rounded-full bg-secondary" />
                  <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">Align ID within frame</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Status Card */}
        <View className="w-full bg-surface-container-low/60 border border-white/10 rounded-lg p-[24px] flex-row items-start gap-[12px] mb-[24px]">
          <View className="w-10 h-10 rounded-full bg-surface-container items-center justify-center border border-white/5">
            <MaterialIcons name="shield" size={20} color="#f4be4e" />
          </View>
          <View className="flex-1">
            <Text className="text-[18px] font-semibold text-on-background mb-1">Verifying your identity</Text>
            <Text className="text-[14px] text-on-surface-variant">Your data is encrypted and securely processed to maintain exclusivity.</Text>
          </View>
        </View>

        {/* Tips */}
        <View className="w-full px-[12px] mb-[24px] gap-[12px]">
          <View className="flex-row items-center gap-[12px]">
            <MaterialIcons name="lightbulb" size={18} color="rgba(244,190,78,0.7)" />
            <Text className="text-[14px] text-on-surface-variant">Ensure good lighting, avoid glare.</Text>
          </View>
          <View className="flex-row items-center gap-[12px]">
            <MaterialIcons name="crop-free" size={18} color="rgba(244,190,78,0.7)" />
            <Text className="text-[14px] text-on-surface-variant">Keep all four corners visible.</Text>
          </View>
        </View>

        {error ? (
          <View className="w-full mb-[16px]">
            <InlineError message={error} />
          </View>
        ) : null}

        {success && (
          <View className="bg-primary-container/20 p-[12px] rounded-[10px] w-full mb-[16px]">
            <Text className="text-primary text-[14px] text-center font-semibold">✅ ID verified! Redirecting...</Text>
          </View>
        )}

        {/* Actions */}
        <View className="w-full mt-auto gap-[12px]">
          <TouchableOpacity
            className="w-full bg-primary-container py-[16px] rounded-lg items-center justify-center flex-row gap-2"
            onPress={image ? handleVerify : takePhoto}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            <MaterialIcons name={image ? 'verified' : 'photo-camera'} size={24} color="#faf6ff" />
            <Text className="text-[16px] font-semibold text-on-primary-container">
              {loading ? 'Verifying...' : image ? 'Verify ID' : 'Capture ID'}
            </Text>
          </TouchableOpacity>

          {image && (
            <TouchableOpacity
              className="w-full bg-surface-container-high border border-outline-variant py-[16px] rounded-lg items-center"
              onPress={takePhoto}
            >
              <Text className="text-[16px] text-on-surface">Retake Photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
