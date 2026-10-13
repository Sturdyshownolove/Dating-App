export type TierLevel = 'FREE' | 'TIER_1' | 'TIER_2' | 'TIER_3';

export interface TierConfig {
  id: TierLevel;
  name: string;
  price: string;
  pricePerMonth: string;
  duration: number; // seconds for match timer
  durationLabel: string;
  swipesPerDay: number;
  boostsPerDay: number;
  seeLikes: boolean;
  superLikesPerDay: number;
  description: string;
  revenueCatId: string;
}

export const TIERS: Record<TierLevel, TierConfig> = {
  FREE: {
    id: 'FREE',
    name: 'Free',
    price: '$0',
    pricePerMonth: '$0',
    duration: 3600, // 1 hour
    durationLabel: '1 Hour',
    swipesPerDay: 20,
    boostsPerDay: 0,
    seeLikes: false,
    superLikesPerDay: 1,
    description: 'Basic access with limited features',
    revenueCatId: '',
  },
  TIER_1: {
    id: 'TIER_1',
    name: 'Silver',
    price: '$9.99/mo',
    pricePerMonth: '$9.99',
    duration: 7200, // 2 hours
    durationLabel: '2 Hours',
    swipesPerDay: Infinity,
    boostsPerDay: 0,
    seeLikes: false,
    superLikesPerDay: 5,
    description: 'More time, unlimited swipes',
    revenueCatId: 'fuukup_silver_monthly',
  },
  TIER_2: {
    id: 'TIER_2',
    name: 'Gold',
    price: '$19.99/mo',
    pricePerMonth: '$19.99',
    duration: 21600, // 6 hours
    durationLabel: '6 Hours',
    swipesPerDay: Infinity,
    boostsPerDay: 1,
    seeLikes: false,
    superLikesPerDay: 10,
    description: 'Extended time + daily boost',
    revenueCatId: 'fuukup_gold_monthly',
  },
  TIER_3: {
    id: 'TIER_3',
    name: 'Platinum',
    price: '$29.99/mo',
    pricePerMonth: '$29.99',
    duration: 86400, // 24 hours
    durationLabel: '24 Hours',
    swipesPerDay: Infinity,
    boostsPerDay: 3,
    seeLikes: true,
    superLikesPerDay: Infinity,
    description: 'Full access — see who likes you',
    revenueCatId: 'fuukup_platinum_monthly',
  },
} as const;

export const TIER_FEATURES = [
  { key: 'durationLabel', label: 'Match Timer', icon: 'timer-outline' },
  { key: 'swipesPerDay', label: 'Daily Swipes', icon: 'swap-horizontal-outline' },
  { key: 'boostsPerDay', label: 'Daily Boosts', icon: 'rocket-outline' },
  { key: 'superLikesPerDay', label: 'Super Likes', icon: 'star-outline' },
  { key: 'seeLikes', label: 'See Who Likes You', icon: 'eye-outline' },
] as const;
