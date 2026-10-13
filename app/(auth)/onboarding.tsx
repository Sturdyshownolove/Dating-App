import React, { useRef, useState } from 'react';
import { View, Text, Dimensions, FlatList, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'workspace-premium' as const,
    title: 'Curated Excellence',
    desc: 'Connect with a highly vetted, exclusive community designed for meaningful encounters.',
    color: '#f4be4e',
  },
  {
    icon: 'timer' as const,
    title: 'The Golden Hour',
    desc: 'Matches expire in 60 minutes. Spark a connection or let it fade. Urgency breeds authenticity.',
    color: '#c6bfff',
    showTimer: true,
  },
  {
    icon: 'verified-user' as const,
    title: 'Ironclad Privacy',
    desc: 'Every member is strictly verified. Your data is encrypted, your presence is secure.',
    color: '#c6bfff',
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <View className="flex-1 bg-background">
      {/* Background Ambient Glows */}
      <View className="absolute inset-0 z-0">
        <View className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary-container/10 rounded-full opacity-40" />
        <View className="absolute bottom-[-10%] left-[-10%] w-72 h-72 bg-secondary/5 rounded-full opacity-40" />
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Sync currentIndex with manual swipe so the pagination dots
        // and the Next/Enter button label stay aligned. Pre-fix the
        // FlatList was scrollEnabled={false} — users could only tap
        // Next, no skipping ahead (audit O-9).
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(Math.max(0, Math.min(SLIDES.length - 1, page)));
        }}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <View style={{ width }} className="flex-1 justify-center items-center px-[20px]">
            {/* Hero Graphic */}
            <View className="w-full max-w-sm aspect-[4/5] rounded-3xl overflow-hidden mb-[40px] items-center justify-center bg-surface-container-low border border-surface-container-highest/50">
              {item.showTimer ? (
                /* Timer Ring for slide 2 */
                <View className="w-48 h-48 rounded-full border-4 border-surface-container-highest items-center justify-center">
                  <View className="absolute inset-[-4px] rounded-full border-4 border-transparent border-t-secondary border-r-secondary border-b-secondary" style={{ transform: [{ rotate: '45deg' }] }} />
                  <View className="items-center">
                    <Text className="text-[40px] font-bold text-on-surface">60</Text>
                    <Text className="text-[12px] font-bold text-secondary uppercase tracking-widest">Minutes</Text>
                  </View>
                </View>
              ) : (
                /* Icon circle for slides 1 & 3 */
                <View className="w-32 h-32 rounded-full bg-surface-container/40 border border-white/10 items-center justify-center">
                  <MaterialIcons name={item.icon as any} size={48} color={item.color} />
                </View>
              )}
            </View>

            {/* Text Content */}
            <View className="items-center px-[16px]">
              <Text className="text-[32px] font-bold text-on-surface mb-[12px] text-center tracking-tight">{item.title}</Text>
              <Text className="text-[18px] text-on-surface-variant text-center leading-7">{item.desc}</Text>
            </View>
          </View>
        )}
      />

      {/* Bottom Controls */}
      <View className="absolute bottom-0 left-0 right-0 px-[20px] pb-[40px] pt-[24px] items-center z-20">
        {/* Pagination Dots */}
        <View className="flex-row gap-[8px] mb-[24px]">
          {SLIDES.map((_, i) => (
            <View
              key={i}
              className={`h-1 rounded-full ${i === currentIndex ? 'w-8 bg-secondary' : 'w-2 bg-surface-container-highest'}`}
            />
          ))}
        </View>

        {/* Primary Action */}
        <TouchableOpacity
          className="w-full max-w-sm bg-primary-container py-[12px] px-[24px] rounded-xl items-center justify-center flex-row gap-[4px] border border-white/10"
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text className="text-[24px] font-semibold text-on-primary-container">
            {currentIndex === SLIDES.length - 1 ? 'Enter the Club' : 'Next'}
          </Text>
          <MaterialIcons name="arrow-forward" size={24} color="#faf6ff" />
        </TouchableOpacity>

        {/* Login link */}
        <TouchableOpacity onPress={() => router.replace('/(auth)/login')} className="mt-[12px]">
          <Text className="text-[16px] text-on-surface-variant/60 text-center">
            Already approved? <Text className="text-primary underline">Log in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
