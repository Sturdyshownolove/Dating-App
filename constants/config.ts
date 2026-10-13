// Firebase + RevenueCat config previously lived here as placeholder
// objects — neither was wired to anything real (RN-Firebase reads
// google-services.json / GoogleService-Info.plist natively; RC SDK
// keys are env-driven from `EXPO_PUBLIC_RC_KEY_*` in app/_layout.tsx).
// Deleted 2026-05-24 to remove the foot-gun where a future caller
// would re-configure RC with the placeholder strings.

// App Settings
export const APP_CONFIG = {
  appName: "Fuuk'Up",
  minAge: 18,
  maxAge: 65,
  defaultSearchRadius: 50, // km
  maxSearchRadius: 200, // km
  // Matches the 3-slot grid the profile-setup screen renders today
  // (main hero + 2 secondary). Bump when the UI grid is expanded; the
  // cap check in profile-setup reads this value, so one change updates
  // both source-of-truth sites.
  maxPhotos: 3,
  maxBioLength: 500,
  otpResendCooldown: 60, // seconds
  timerWarningThreshold: 600, // 10 minutes - send notification
  timerCriticalThreshold: 300, // 5 minutes - UI turns red
  defaultSwipesPerDay: 20,
  maxMessageLength: 1000,
  typingTimeout: 3000, // ms before typing indicator disappears
  matchCheckDebounce: 500, // ms
};

// Blocked social media patterns
export const BLOCKED_LINK_PATTERNS = [
  /instagram\.com/i,
  /ig:/i,
  /@[\w]+/i,
  /snapchat\.com/i,
  /snap:/i,
  /twitter\.com/i,
  /x\.com/i,
  /tiktok\.com/i,
  /facebook\.com/i,
  /fb\.com/i,
  /linkedin\.com/i,
  /whatsapp\.com/i,
  /telegram\.me/i,
  /t\.me/i,
  /discord\.gg/i,
  /wa\.me/i,
  /https?:\/\//i,
  /www\./i,
];

// Gender options shown in profile-setup. Stored verbatim on the user doc.
export const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Other'] as const;
export type Gender = typeof GENDER_OPTIONS[number];

// Interests list
export const INTERESTS = [
  '🎵 Music', '🎬 Movies', '📚 Reading', '✈️ Travel',
  '🍳 Cooking', '🏋️ Fitness', '🎮 Gaming', '📸 Photography',
  '🎨 Art', '💃 Dancing', '🧘 Yoga', '🏃 Running',
  '🍷 Wine', '☕ Coffee', '🐕 Dogs', '🐈 Cats',
  '🌱 Vegan', '🏖️ Beach', '⛰️ Hiking', '🎭 Theater',
  '🏀 Basketball', '⚽ Football', '🎾 Tennis', '🏊 Swimming',
  '🎤 Karaoke', '🎧 Podcasts', '📺 Netflix', '🎪 Festivals',
  '🍕 Foodie', '💻 Tech', '🌍 Culture', '🧠 Psychology',
] as const;
