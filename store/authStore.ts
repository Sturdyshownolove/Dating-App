import { create } from 'zustand';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from '@/services/auth';
import { db, Collections } from '@/services/firebase';
import { getUserProfile, subscribeToUser, UserProfile } from '@/services/firestore';
import { registerForPushNotifications } from '@/services/notifications';
import { initRevenueCat, logOutRevenueCat } from '@/services/revenuecat';

// Profile subscription handle. Module-level so the auth-state-change
// listener can tear down the previous user's subscription before
// starting a new one (account switch on same device).
let profileUnsubscribe: (() => void) | null = null;

interface AuthState {
  user: FirebaseAuthTypes.User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  verificationId: string | null;
  // Last phone number used for `sendPhoneOTP`. Kept so the OTP screen's
  // Resend button can re-trigger the send without making the user retype.
  // Cleared on logout so it does not bleed into the next account session.
  lastPhoneNumber: string | null;
  // Mirror of `firebaseAuth.currentUser.emailVerified` for reactive
  // access in route gating (audit S1-5 phase 2). Phone-method users
  // have no email; the value reflects whatever Firebase returns
  // (typically true for phone users since there's no email to verify).
  emailVerified: boolean;

  setUser: (user: FirebaseAuthTypes.User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setVerificationId: (id: string | null) => void;
  setLastPhoneNumber: (phone: string | null) => void;
  // After `firebaseAuth.currentUser.reload()`, the value updates
  // in-place but `onAuthStateChanged` does NOT fire — so the store
  // wouldn't pick up the new emailVerified unless the caller pushes
  // it in via this setter. Used by the verify-email screen poll.
  setEmailVerified: (verified: boolean) => void;
  loadProfile: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  verificationId: null,
  lastPhoneNumber: null,
  emailVerified: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setProfile: (profile) => set({ profile }),

  setLoading: (isLoading) => set({ isLoading }),

  setVerificationId: (verificationId) => set({ verificationId }),

  setLastPhoneNumber: (lastPhoneNumber) => set({ lastPhoneNumber }),

  setEmailVerified: (emailVerified) => set({ emailVerified }),

  loadProfile: async (userId: string) => {
    const profile = await getUserProfile(userId);
    set({ profile });
  },

  logout: async () => {
    const { user } = get();
    if (user) {
      // Best-effort: drop the push token so server pushes don't keep landing
      // on this device after the user signs out. The authoritative location
      // is `users/{uid}/private/push.token` (owner-only); the legacy clear is
      // kept transitionally so any pre-fix value also disappears.
      try {
        await db
          .collection(Collections.USERS).doc(user.uid)
          .collection('private').doc('push')
          .set({ token: '' }, { merge: true });
      } catch (err) {
        console.warn('Failed to clear private push token on logout:', err);
      }
      // Legacy top-level `users/{uid}.pushToken` is swept by the
      // `sweepLegacyUserFields` CF — no client-side clear needed here.
      // Reset RC to anonymous so the next account that signs in on this
      // device gets its own RC subscriber. Without this, the new user's
      // purchases attribute to the previous user. Best-effort.
      await logOutRevenueCat();
    }
    await firebaseSignOut();
    set({
      user: null,
      profile: null,
      isAuthenticated: false,
      verificationId: null,
      lastPhoneNumber: null,
    });
  },

  initialize: () => {
    const unsubscribe = onAuthStateChanged(async (user) => {
      // Tear down any prior subscription before re-opening — covers
      // logout AND account-switch-on-same-device.
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (!user) {
        // Unauthenticated bootstrap path — nothing to fetch; the splash
        // gates on `isLoading === false` and routes to /(auth)/onboarding.
        set({
          user: null,
          isAuthenticated: false,
          profile: null,
          emailVerified: true,
          isLoading: false,
        });
        return;
      }

      // Authenticated path — flip auth state immediately but defer
      // `isLoading=false` until profile is fetched. Pre-fix the loading
      // flag dropped before the profile arrived, so the splash routed
      // on a stale `profile=null` and briefly flashed returning users
      // through /(auth)/profile-setup (audit O-1).
      //
      // emailVerified is mirrored here for reactive gating. Phone-method
      // users have no email — Firebase returns emailVerified=true for
      // them, so the future gate's "block if !emailVerified" check is a
      // no-op for phone users.
      set({ user, isAuthenticated: true, emailVerified: !!user.emailVerified });

      // Real-time profile listener (replaces the prior one-shot
      // getUserProfile call). Mid-session writes — tier sync after a
      // purchase, verification flag flipped by a CF, profile edits
      // from another device — now reach the UI on the next listener
      // tick instead of waiting for the next cold start (closes the
      // residual flagged in premium_tier_sync_from_profile_2026-05-24).
      //
      // isLoading flips to false on the FIRST emission so the splash
      // routing keeps its "wait for profile" semantics.
      let firstEmission = true;
      profileUnsubscribe = subscribeToUser(user.uid, (profile) => {
        set({ profile });
        if (firstEmission) {
          firstEmission = false;
          set({ isLoading: false });
        }
      });

      // Fire-and-forget: writes pushToken to users/{uid}/private/push so
      // the FCM CFs (onMatchCreated, autoExpireMatches, timerWarningCheck)
      // can deliver. Idempotent — Expo returns the same token across
      // launches; if permission is denied, the function returns null
      // gracefully and no token is written.
      registerForPushNotifications(user.uid).catch((err) =>
        console.warn('push registration failed:', err)
      );

      // Fire-and-forget: log this Firebase UID into RevenueCat so the
      // RC SDK associates purchases with the right user. Without this,
      // RC tracks anonymous device IDs and `syncTierFromEntitlements`
      // can't find the subscriber → silently returns FREE for everyone.
      // Idempotent via the `didLogIn` guard in services/revenuecat.ts.
      initRevenueCat(user.uid).catch((err) =>
        console.warn('RC login failed:', err)
      );
    });
    return () => {
      // Compose: unsubscribe the auth listener AND any in-flight
      // profile subscription. Called when the consumer (RootLayout)
      // unmounts.
      unsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
    };
  },
}));
