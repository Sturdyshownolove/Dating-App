import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SwipeDeck, type SwipeDeckRef } from '@/components/cards/SwipeDeck';
import { MatchModal } from '@/components/match/MatchModal';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { getNearbyProfiles, createSwipe, UserProfile, FeedCursor } from '@/services/firestore';
import { useLocation } from '@/hooks/useLocation';

// Page size per getDiscoveryFeed call. The CF does swiped-exclusion +
// filtering + ranking server-side, so one call yields real candidates (or
// signals exhaustion) — no client-side page looping needed.
const FEED_PAGE_SIZE = 20;

export default function HomeScreen() {
  const { user, profile } = useAuthStore();
  const { setNewMatch } = useMatchStore();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchedProfile, setMatchedProfile] = useState<UserProfile | null>(null);
  const [showMatch, setShowMatch] = useState(false);
  const swipeDeckRef = useRef<SwipeDeckRef>(null);
  const [needsLocation, setNeedsLocation] = useState(false);
  const { requestLocation } = useLocation(user?.uid);
  // Coalesce concurrent prefetches — the deck triggers onEmpty at <=5 remaining,
  // which can fire twice if the user swipes through the prefetch threshold quickly.
  const loadInFlight = useRef(false);
  // Opaque feed cursor minted by getDiscoveryFeed; resumes paging server-side.
  const feedCursor = useRef<FeedCursor>(null);
  // Once the feed is drained, stop refilling so onEmpty doesn't re-query an
  // empty tail on every swipe.
  const feedExhausted = useRef(false);

  const loadProfiles = useCallback(async () => {
    if (!user || loadInFlight.current || feedExhausted.current) return;
    loadInFlight.current = true;
    setLoading(true);
    try {
      const { profiles: batch, nextCursor, needsLocation: nl } =
        await getNearbyProfiles(FEED_PAGE_SIZE, feedCursor.current);
      if (nl) {
        // Viewer has no coords — the distance feed can't run. Surface the
        // enable-location CTA instead of a silent empty deck.
        setNeedsLocation(true);
        feedExhausted.current = true;
        return;
      }
      feedCursor.current = nextCursor;
      if (nextCursor === null) feedExhausted.current = true;
      if (batch.length > 0) {
        setProfiles((prev) => {
          const existing = new Set(prev.map((p) => p.id));
          return [...prev, ...batch.filter((r) => !existing.has(r.id))];
        });
      }
    } finally {
      setLoading(false);
      loadInFlight.current = false;
    }
  }, [user]);

  // Enable-location CTA handler. requestLocation writes the precise coords
  // to users/{uid}/private/location, which the feed CF reads directly as
  // the viewer's center — so an immediate retry works (no sync-trigger wait).
  const handleEnableLocation = useCallback(async () => {
    const loc = await requestLocation();
    if (loc) {
      setNeedsLocation(false);
      feedExhausted.current = false;
      feedCursor.current = null;
      loadProfiles();
    }
  }, [requestLocation, loadProfiles]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleSwipe = async (swipedProfile: UserProfile, action: 'like' | 'pass') => {
    if (!user) return;
    setProfiles((prev) => prev.filter((p) => p.id !== swipedProfile.id));

    const result = await createSwipe(swipedProfile.id, action);
    if (result.capReached) {
      // Restore the card the user never actually got to swipe and surface why.
      setProfiles((prev) => [swipedProfile, ...prev.filter((p) => p.id !== swipedProfile.id)]);
      Alert.alert(
        'Daily limit reached',
        'You’ve used all your swipes for today. Upgrade for unlimited swipes.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(tabs)/premium') },
        ]
      );
      return;
    }
    if (result.matched && result.matchId) {
      setMatchedProfile(swipedProfile);
      setNewMatch(result.matchId);
      setShowMatch(true);
    }
  };

  // Profile is null until authStore.initialize resolves — render nothing rather
  // than flashing the verification gate during the first paint.
  if (!profile) {
    return <View className="flex-1 bg-background" />;
  }

  const isVerified = profile.verifiedSelfie && profile.verifiedID;

  if (!isVerified) {
    return (
      <View className="flex-1 justify-center items-center p-10 bg-background">
        <Text className="text-6xl mb-4">🔒</Text>
        <Text className="text-white text-2xl font-bold mb-2">Verification Required</Text>
        <Text className="text-white/60 text-base text-center mb-6">Complete verification to start swiping</Text>
        <TouchableOpacity
          className="bg-primary px-8 py-3 rounded-2xl"
          onPress={() => router.push('/(auth)/selfie-verify')}
        >
          <Text className="text-white text-base font-semibold">Verify Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (needsLocation) {
    return (
      <View className="flex-1 justify-center items-center p-10 bg-background">
        <Text className="text-6xl mb-4">📍</Text>
        <Text className="text-white text-2xl font-bold mb-2">Enable Location</Text>
        <Text className="text-white/60 text-base text-center mb-6">
          We use your location to show people near you. Turn it on to start discovering.
        </Text>
        <TouchableOpacity
          className="bg-primary px-8 py-3 rounded-2xl"
          onPress={handleEnableLocation}
        >
          <Text className="text-white text-base font-semibold">Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background pt-8">
      {/* Header - Mobile Only (Tailwind md:hidden equivalent for React Native is just standard rendering since we don't do responsive typically on RN) */}
      <View className="flex-row justify-between items-center h-16 px-5 w-full z-50">
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings')} className="p-2 active:scale-95">
          <MaterialIcons name="settings" size={24} color="#6C5CE7" />
        </TouchableOpacity>
        <Text className="text-xl font-black text-white tracking-tighter uppercase text-primary">Fuu'k Up</Text>
        <TouchableOpacity className="p-2 active:scale-95">
          <MaterialIcons name="schedule" size={24} color="#ffffff99" />
        </TouchableOpacity>
      </View>

      {/* Main Canvas: Full Screen Swipe Area */}
      <View className="flex-1 relative w-full items-center justify-center p-4">
        
        {/* Swipe area wrapper */}
        <View className="flex-1 w-full max-w-md items-center justify-center mb-8 relative z-10">
          <SwipeDeck
            ref={swipeDeckRef}
            profiles={profiles}
            onSwipe={handleSwipe}
            onEmpty={loadProfiles}
            paused={showMatch}
          />
        </View>

        {/* Action Buttons (Rendered below swipe deck) */}
        {profiles.length > 0 && (
          <View className="flex-row justify-center items-center gap-8 mb-6 z-20">
            {/* Pass Button */}
            <TouchableOpacity
              onPress={() => swipeDeckRef.current?.swipeLeft()}
              className="w-16 h-16 rounded-full bg-[#1A1333] border border-white/10 items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <MaterialIcons name="close" size={32} color="#f4be4e" />
            </TouchableOpacity>

            {/* Super Like / Star */}
            <TouchableOpacity
              className="w-12 h-12 rounded-full bg-surface-container-low border border-white/5 items-center justify-center active:scale-95 transition-transform -translate-y-4"
            >
              <MaterialIcons name="star" size={24} color="#c6bfff" />
            </TouchableOpacity>

            {/* Like Button */}
            <TouchableOpacity
              onPress={() => swipeDeckRef.current?.swipeRight()}
              className="w-16 h-16 rounded-full bg-[#1A1333] border border-white/10 items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <MaterialIcons name="favorite" size={32} color="#ffb4ab" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Match modal */}
      <MatchModal
        visible={showMatch}
        myProfile={profile}
        matchedProfile={matchedProfile}
        onChat={() => {
          setShowMatch(false);
          const matchId = useMatchStore.getState().newMatchId;
          if (matchId) router.push(`/(tabs)/chat/${matchId}`);
        }}
        onClose={() => setShowMatch(false)}
      />
    </SafeAreaView>
  );
}
