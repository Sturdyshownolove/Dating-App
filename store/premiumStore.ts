import { create } from 'zustand';
import { getOfferings, purchasePackage, restorePurchases } from '@/services/revenuecat';
import { useAuthStore } from '@/store/authStore';
import { PurchasesPackage } from 'react-native-purchases';

// Tier of truth lives on `users/{uid}.tierLevel` in Firestore — written
// server-side by the `syncTierFromEntitlements` Cloud Function after
// RC confirms the entitlement. Consumers read it via
// `useAuthStore((s) => s.profile?.tierLevel ?? 'FREE')`; this store only
// owns the local purchase-flow scaffolding (offerings, loading, the
// purchase/restore calls), not the tier value itself.
//
// Pre-rewrite this store mirrored RC's `currentTier` locally and let
// consumers read it directly. Result: even when the CF wrote the right
// tier to Firestore, the in-app premium screens kept showing FREE
// because the store never re-derived. `initialize`, `setTier`,
// `isSubscribed`, and `currentTier` are removed — single source of
// truth is the profile.

interface PremiumState {
  offerings: PurchasesPackage[];
  isLoading: boolean;

  loadOfferings: () => Promise<void>;
  purchase: (pkg: PurchasesPackage, userId: string) => Promise<{ success: boolean; error?: string }>;
  restore: (userId: string) => Promise<void>;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  offerings: [],
  isLoading: false,

  loadOfferings: async () => {
    set({ isLoading: true });
    const pkgs = await getOfferings();
    set({ offerings: pkgs, isLoading: false });
  },

  purchase: async (pkg, userId) => {
    set({ isLoading: true });
    const result = await purchasePackage(pkg, userId);
    // `purchasePackage` triggers the `syncTierFromEntitlements` CF
    // which writes the new tier to `users/{uid}.tierLevel`. Re-fetch
    // the profile so the in-app screens pick up the tier immediately.
    if (result.success) {
      await useAuthStore.getState().loadProfile(userId);
    }
    set({ isLoading: false });
    return { success: result.success, error: result.error };
  },

  restore: async (userId) => {
    set({ isLoading: true });
    await restorePurchases(userId);
    // Same pattern as purchase — `restorePurchases` calls the CF which
    // writes the derived tier; re-fetch profile to sync the UI.
    await useAuthStore.getState().loadProfile(userId);
    set({ isLoading: false });
  },
}));
