import React from 'react';
import { View, Text, Image, Dimensions, PixelRatio } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { UserProfile } from '@/services/firestore';
import { cdnImage } from '@/services/storage';
import { MaterialIcons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W - 32;
const CARD_H = SCREEN_H * 0.65; // Slightly taller as per design
// Round up to the nearest 100px so Cloudinary cache hits across similar devices.
const PHOTO_WIDTH = Math.ceil(PixelRatio.getPixelSizeForLayoutSize(CARD_W) / 100) * 100;

interface SwipeCardProps {
  profile: UserProfile;
  distance?: number;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({ profile, distance }) => {
  const mainPhoto = cdnImage(profile.photos?.[0], PHOTO_WIDTH);

  return (
    <View 
      className="bg-[#1A1333] rounded-3xl overflow-hidden border border-white/5 shadow-2xl"
      style={{ width: CARD_W, height: CARD_H }}
    >
      {/* Profile Image */}
      {mainPhoto ? (
        <Image source={{ uri: mainPhoto }} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <View className="absolute inset-0 w-full h-full bg-surface-container-high items-center justify-center">
          <MaterialIcons name="person" size={80} color="#c8c4d7" />
        </View>
      )}

      {/* Gradient Overlay for Text */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
        className="absolute inset-x-0 bottom-0 h-3/5 justify-end p-6"
      >
        {/* Top Badges area */}
        <View className="absolute top-6 left-6 right-6 flex-row justify-between items-start">
          {profile.verifiedSelfie && (
            <View className="bg-black/40 rounded-full px-3 py-1 flex-row items-center gap-1 border border-white/10">
              <MaterialIcons name="verified" size={14} color="#f4be4e" />
              <Text className="text-white text-xs font-bold tracking-widest uppercase">Verified</Text>
            </View>
          )}
        </View>

        {/* Profile Info */}
        <View className="mb-4">
          <View className="flex-row items-end gap-3 mb-1">
            <Text className="text-white text-4xl font-bold tracking-tighter drop-shadow-md">{profile.name}</Text>
            <Text className="text-white/80 text-2xl font-semibold pb-1">{profile.age}</Text>
          </View>
          <View className="flex-row items-center gap-4 text-white/70">
            {distance !== undefined && (
              <View className="flex-row items-center gap-1">
                <MaterialIcons name="location-on" size={18} color="#e5e0ed" />
                <Text className="text-white/70 text-base">{distance} miles away</Text>
              </View>
            )}
            {/* Hardcoded job for now to match design vibe, but can be replaced if backend adds it */}
            <View className="flex-row items-center gap-1">
              <MaterialIcons name="work" size={18} color="#e5e0ed" />
              <Text className="text-white/70 text-base">Creative</Text>
            </View>
          </View>
        </View>

        {/* Tags/Interests */}
        <View className="flex-row flex-wrap gap-2 mb-2">
          {profile.interests?.slice(0, 3).map((interest, i) => (
            <View key={i} className="bg-white/10 border border-white/5 rounded-full px-4 py-1.5">
              <Text className="text-white text-xs font-bold tracking-widest uppercase">{interest}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
};
