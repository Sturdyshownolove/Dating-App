import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { updateUserProfile } from '@/services/firestore';
import { uploadPhoto, deletePhoto } from '@/services/storage';
import { validateBio, validateName, validateAge } from '@/utils/validation';
import { INTERESTS, GENDER_OPTIONS, APP_CONFIG, type Gender } from '@/constants/config';
import { LinearGradient } from 'expo-linear-gradient';
import { StageProgress } from '@/components/ui/StageProgress';
import { InlineError } from '@/components/ui/InlineError';

export default function ProfileSetupScreen() {
  const { user, profile, loadProfile } = useAuthStore();
  const params = useLocalSearchParams<{ edit?: string }>();
  // Edit mode is opt-in via ?edit=1 from Settings → Edit Profile.
  // Without the flag the screen behaves like first-time setup (and
  // the (auth) layout guard would have already bounced a complete
  // user before render). With it, we pre-fill from the existing
  // profile and skip the isProfileComplete toggle on submit so the
  // edit doesn't re-fire the verification gating flow.
  const isEditMode = params.edit === '1';

  const [name, setName] = useState('');
  const [ageInput, setAgeInput] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(15);
  // Inline error state replaces the prior Alert.alert chain (audit
  // O-16). One source of truth for "what's wrong with this submit"
  // rendered via <InlineError /> at the top of the form.
  const [error, setError] = useState('');

  // Pre-fill from existing profile when invoked as an edit. Without this,
  // local state stays empty and submit overwrites the user doc with
  // blanks → data loss (audit O-3).
  useEffect(() => {
    if (!isEditMode || !profile) return;
    setName(profile.name ?? '');
    setAgeInput(profile.age && profile.age > 0 ? String(profile.age) : '');
    setGender(((profile.gender as Gender) || '') as Gender | '');
    setBio(profile.bio ?? '');
    setPhotos(Array.isArray(profile.photos) ? profile.photos : []);
    setSelectedInterests(Array.isArray(profile.interests) ? profile.interests : []);
  }, [isEditMode, profile]);

  const pickPhoto = async () => {
    if (photos.length >= APP_CONFIG.maxPhotos) {
      setError(`Max ${APP_CONFIG.maxPhotos} photos for now`);
      return;
    }
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8, allowsEditing: true, aspect: [4, 5],
    });
    if (!result.canceled) setPhotos([...photos, result.assets[0].uri]);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== interest));
    } else if (selectedInterests.length < 5) {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setError('');
    const nameCheck = validateName(name);
    if (!nameCheck.valid) { setError(nameCheck.error!); return; }
    const age = parseInt(ageInput, 10);
    if (!validateAge(age)) { setError('Age must be between 18 and 100'); return; }
    if (!gender) { setError('Select a gender'); return; }
    if (photos.length < 1) { setError('Add at least 1 photo'); return; }
    const bioCheck = validateBio(bio);
    if (!bioCheck.valid) { setError(bioCheck.error!); return; }

    setLoading(true);
    try {
      // Photo handling: entries that are already remote URLs (e.g. the
      // existing photos[] on a returning user editing) are kept as-is;
      // local URIs (file:// or content://) get uploaded. Preserves order.
      const uploadedUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (p.startsWith('http://') || p.startsWith('https://')) {
          uploadedUrls.push(p);
        } else {
          const url = await uploadPhoto(p);
          if (url) uploadedUrls.push(url);
        }
      }
      await updateUserProfile(user.uid, {
        name: name.trim(),
        age,
        gender,
        bio: bio.trim(),
        photos: uploadedUrls,
        interests: selectedInterests,
        // Only flip isProfileComplete on first-time setup. In edit mode
        // the user is already complete; re-asserting it would be a no-op
        // but writing it could trip future schema-version logic.
        ...(isEditMode ? {} : { isProfileComplete: true }),
      });

      // Edit-mode photo cleanup: any URL that was on the old profile
      // but isn't in the saved list is now orphaned in Cloudinary.
      // Best-effort fire-and-forget destroy via deletePhoto CF; the
      // user-facing intent (URL gone from the doc) is satisfied even
      // if the destroy fails — orphan bytes remain but the
      // sweepLegacyUserFields path isn't designed for per-photo
      // cleanup. Without this, every edit-mode photo removal leaked
      // bytes indefinitely.
      if (isEditMode) {
        const oldUrls = new Set(profile?.photos ?? []);
        const removed = [...oldUrls].filter((u) => !uploadedUrls.includes(u));
        await Promise.allSettled(removed.map((u) => deletePhoto(u)));
      }

      await loadProfile(user.uid);
      // First-time setup hands off to the verification flow; edit returns
      // to settings (which is where the user came from).
      router.replace(isEditMode ? '/(tabs)/settings' : '/(auth)/selfie-verify');
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-background" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* TopAppBar */}
      <View className="flex-row justify-between items-center h-16 px-5 border-b border-white/10 bg-[#0F0C1A]/80 z-50">
        <TouchableOpacity onPress={() => router.back()} className="p-2 active:scale-95">
          <MaterialIcons name="arrow-back" size={24} color="#6C5CE7" />
        </TouchableOpacity>
        <Text className="text-xl font-bold tracking-tighter uppercase text-[#6C5CE7]">Fuu'k Up</Text>
        <View className="p-2"><MaterialIcons name="schedule" size={24} color="#6C5CE7" /></View>
      </View>

      <ScrollView className="flex-1 pt-4 pb-20 px-5 max-w-md mx-auto w-full" showsVerticalScrollIndicator={false}>
        {/* Step indicator — only shown in setup mode; edit mode skips
            since it's not a funnel-progress moment. */}
        {!isEditMode && <StageProgress current={1} total={3} />}

        {/* Header */}
        <View className="mb-4">
          <Text className="text-3xl font-bold text-on-background mb-1">Curate Your Vibe</Text>
          <Text className="text-base text-on-surface-variant">Upload high-fidelity visuals to complete your dossier.</Text>
        </View>

        {error ? (
          <View className="mb-[16px]">
            <InlineError message={error} />
          </View>
        ) : null}

        {/* Identity (Name + Age + Gender) */}
        <View className="mb-6 gap-4">
          {/* Name */}
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialIcons name="badge" size={18} color="#c8c4d7" />
              <Text className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Display Name</Text>
            </View>
            <View className="bg-surface-container-high rounded-lg p-3 border border-white/5">
              <TextInput
                className="text-base text-on-background"
                placeholder="Your first name"
                placeholderTextColor="#c8c4d780"
                value={name}
                onChangeText={setName}
                maxLength={30}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Age */}
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialIcons name="cake" size={18} color="#c8c4d7" />
              <Text className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Age</Text>
            </View>
            <View className="bg-surface-container-high rounded-lg p-3 border border-white/5">
              <TextInput
                className="text-base text-on-background"
                placeholder="18+"
                placeholderTextColor="#c8c4d780"
                value={ageInput}
                onChangeText={(t) => setAgeInput(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                maxLength={3}
              />
            </View>
          </View>

          {/* Gender */}
          <View>
            <View className="flex-row items-center gap-2 mb-2">
              <MaterialIcons name="wc" size={18} color="#c8c4d7" />
              <Text className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Gender</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => {
                const isSelected = gender === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setGender(option)}
                    className={`px-3 py-1.5 rounded-full border ${isSelected ? 'border-primary-container bg-primary-container/10' : 'border-white/10 bg-surface-container'}`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-primary-container' : 'text-on-surface-variant'}`}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Photo Grid (Bento Layout) */}
        <View className="flex-row flex-wrap gap-4 mb-6">
          {/* Main Hero Slot */}
          <TouchableOpacity onPress={photos[0] ? () => removePhoto(0) : pickPhoto} className="w-full aspect-[4/5] rounded-xl overflow-hidden relative bg-surface-container-high/40 border border-white/5 flex items-center justify-center">
            {photos[0] ? (
              <>
                <Image source={{ uri: photos[0] }} className="absolute inset-0 w-full h-full object-cover" />
                <LinearGradient colors={['transparent', 'rgba(15,12,26,0.8)']} className="absolute inset-0" />
                <View className="absolute bottom-4 right-4 bg-error/90 rounded-full p-2">
                  <MaterialIcons name="delete" size={24} color="white" />
                </View>
              </>
            ) : (
              <View className="items-center justify-center">
                <MaterialIcons name="add-photo-alternate" size={48} color="#c8c4d7" />
                <Text className="text-on-surface-variant mt-2">Main Photo</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Secondary Slots (Row) */}
          <View className="flex-row gap-4 w-full h-32">
            {[1, 2].map((index) => (
              <TouchableOpacity key={index} onPress={photos[index] ? () => removePhoto(index) : pickPhoto} className="flex-1 rounded-xl bg-surface-container-high/40 border border-white/5 flex items-center justify-center">
                {photos[index] ? (
                  <>
                    <Image source={{ uri: photos[index] }} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
                    <View className="absolute bottom-2 right-2 bg-error/90 rounded-full p-1">
                      <MaterialIcons name="delete" size={16} color="white" />
                    </View>
                  </>
                ) : (
                  <MaterialIcons name="add" size={32} color="#c8c4d7" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bio Input */}
        <View className="mb-6">
          <View className="flex-row items-center gap-2 mb-2">
            <MaterialIcons name="edit-note" size={18} color="#c8c4d7" />
            <Text className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">The Narrative</Text>
          </View>
          <View className="bg-surface-container-high rounded-lg p-3 border border-white/5">
            <TextInput
              className="text-base text-on-background h-24"
              placeholder="Define your presence... (No external links)"
              placeholderTextColor="#c8c4d780"
              multiline
              textAlignVertical="top"
              value={bio}
              onChangeText={setBio}
            />
          </View>
        </View>

        {/* Interests Tags */}
        <View className="mb-6">
          <View className="flex-row items-center gap-2 mb-3">
            <MaterialIcons name="local-fire-department" size={18} color="#c8c4d7" />
            <Text className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">Interests</Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  className={`px-3 py-1.5 rounded-full border ${isSelected ? 'border-primary-container bg-primary-container/10' : 'border-white/10 bg-surface-container'}`}
                >
                  <Text className={`text-xs font-bold ${isSelected ? 'text-primary-container' : 'text-on-surface-variant'}`}>
                    {interest}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Action Area */}
        <View className="mt-4 mb-8">
          <TouchableOpacity
            onPress={handleFinish}
            disabled={loading}
            className="w-full bg-primary-container py-4 rounded-xl shadow-lg flex-row justify-center items-center gap-2 active:scale-95 transition-transform"
          >
            <Text className="text-on-primary-container text-lg font-bold">
              {loading ? 'Processing...' : 'Finalize Entry'}
            </Text>
            {!loading && <MaterialIcons name="check-circle" size={20} color="#faf6ff" />}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
