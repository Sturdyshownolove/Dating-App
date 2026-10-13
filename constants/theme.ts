import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const COLORS = {
  // Core
  background: '#0F0C1A',
  backgroundLight: '#140F24',
  card: '#1A1333',
  cardElevated: '#231B44',
  cardHighlight: '#2D2255',

  // Brand
  primary: '#6C5CE7',
  primaryLight: '#8B7FF0',
  primaryDark: '#5A4BD6',
  primaryGlow: 'rgba(108, 92, 231, 0.35)',

  // Premium
  premium: '#FFC857',
  premiumDark: '#E5A800',
  premiumGlow: 'rgba(255, 200, 87, 0.3)',

  // Text
  text: '#FFFFFF',
  textSecondary: '#B8B8D1',
  textMuted: '#7A7A9A',
  textDark: '#4A4A6A',

  // Status
  success: '#2ED573',
  successGlow: 'rgba(46, 213, 115, 0.3)',
  danger: '#FF6B6B',
  dangerGlow: 'rgba(255, 107, 107, 0.3)',
  warning: '#FFA502',
  warningGlow: 'rgba(255, 165, 2, 0.3)',

  // UI
  border: '#2A2150',
  borderLight: '#3D3470',
  overlay: 'rgba(15, 12, 26, 0.85)',
  overlayLight: 'rgba(15, 12, 26, 0.5)',

  // Timer States
  timerSafe: '#2ED573',
  timerWarning: '#FFA502',
  timerDanger: '#FF6B6B',
  timerCritical: '#FF4757',

  // Swipe
  swipeLike: '#2ED573',
  swipeLikeGlow: 'rgba(46, 213, 115, 0.4)',
  swipePass: '#FF6B6B',
  swipePassGlow: 'rgba(255, 107, 107, 0.4)',
  swipeSuperLike: '#6C5CE7',
} as const;

export const FONTS = {
  light: 'Inter_300Light',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
  '6xl': 48,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  }),
} as const;

export const LAYOUT = {
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  cardWidth: SCREEN_WIDTH - 32,
  cardHeight: SCREEN_HEIGHT * 0.65,
  headerHeight: 56,
  tabBarHeight: 80,
  bottomInset: 34,
} as const;
