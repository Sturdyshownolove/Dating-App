import { create } from 'zustand';
import { Match, subscribeToMatches, getUserProfile, UserProfile, expireMatch } from '@/services/firestore';

interface MatchState {
  matches: Match[];
  activeMatches: Match[];
  expiredMatches: Match[];
  matchProfiles: Record<string, UserProfile>;
  isLoading: boolean;
  newMatchId: string | null;

  setMatches: (matches: Match[]) => void;
  setNewMatch: (matchId: string | null) => void;
  loadMatchProfile: (userId: string) => Promise<void>;
  expireMatchById: (matchId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matches: [],
  activeMatches: [],
  expiredMatches: [],
  matchProfiles: {},
  isLoading: true,
  newMatchId: null,

  setMatches: (matches) => {
    const now = new Date();
    const active = matches.filter((m) => m.isActive && !m.isBlocked && m.expiresAt > now);
    const expired = matches.filter((m) => !m.isActive || m.isBlocked || m.expiresAt <= now);
    set({ matches, activeMatches: active, expiredMatches: expired, isLoading: false });
  },

  setNewMatch: (newMatchId) => set({ newMatchId }),

  loadMatchProfile: async (userId: string) => {
    const existing = get().matchProfiles[userId];
    if (existing) return;
    const profile = await getUserProfile(userId);
    if (profile) {
      set((state) => ({
        matchProfiles: { ...state.matchProfiles, [userId]: profile },
      }));
    }
  },

  expireMatchById: async (matchId: string) => {
    await expireMatch(matchId);
  },

  subscribe: (userId: string) => {
    set({ isLoading: true });
    const unsub = subscribeToMatches(userId, (matches) => {
      get().setMatches(matches);
      // Load profiles for all match partners
      matches.forEach((m) => {
        const partnerId = m.userA === userId ? m.userB : m.userA;
        get().loadMatchProfile(partnerId);
      });
    });
    return unsub;
  },
}));
