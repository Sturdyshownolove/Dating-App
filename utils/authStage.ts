import { UserProfile } from '@/services/firestore';

// Auth-gating predicates. Single source of truth for "given the user's
// current auth state, where should they be?" Consumed by:
//   - app/index.tsx (cold-start splash routing)
//   - app/(auth)/_layout.tsx (deep-link / mid-session guard)
//
// Keeping these here means the two enforcement points cannot drift —
// pre-helper, the splash carried the only copy and direct deep links to
// (auth) screens bypassed the gate entirely (audit S2-2).

// Current version of the T&C / privacy / age-confirmation consent set.
// Bumping this re-prompts every user on next launch because the gate
// compares `profile.consent.version >= TERMS_VERSION`. Bump on any
// material change to terms or privacy policy — granular per-document
// versioning is a phase-2 concern.
export const TERMS_VERSION = 1;

/**
 * Whether the user's recorded consent covers the current TERMS_VERSION.
 * Returns false if no consent doc, or if the recorded version is older
 * than the current one (re-prompt cascade on terms update).
 */
const hasAcceptedCurrentTerms = (profile: UserProfile | null): boolean => {
  const version = profile?.consent?.version;
  return typeof version === 'number' && version >= TERMS_VERSION;
};

/**
 * Whether the user has been through the location-permission stage
 * (audit O-7). Recorded once, regardless of OS-level grant result —
 * a "Skip" or a "Deny" both count as "asked, user answered." Users
 * can change their mind later via Settings → Location Settings.
 */
const wasLocationPrompted = (profile: UserProfile | null): boolean => {
  return !!profile?.locationPromptedAt;
};

export interface AuthGateInput {
  isAuthenticated: boolean;
  profile: UserProfile | null;
  // For email-method users, whether they've clicked the verification
  // link. Phone users have no email — Firebase returns
  // emailVerified=true for them, so the gate is a no-op for that path.
  // Default true preserves pre-S1-5 behaviour for any caller that
  // hasn't been updated to pass the field.
  emailVerified?: boolean;
  // True iff the current user has the `password` provider. Used to
  // scope the email-verification gate so phone users are never
  // bounced through it.
  isEmailUser?: boolean;
}

/**
 * The route the user SHOULD be on for their current state. Used to redirect
 * away from a wrong screen (deep link, mid-flow back-button, etc.) and to
 * pick the post-splash destination.
 */
export const correctAuthRoute = (s: AuthGateInput): string => {
  if (!s.isAuthenticated) return '/(auth)/onboarding';
  // Email-verification gate comes before profile-setup so an unverified
  // email user can't proceed through the rest of onboarding (audit S1-5).
  if (s.isEmailUser && s.emailVerified === false) return '/(auth)/verify-email';
  // T&C / privacy / age-confirmation consent — required for legal
  // basis to process the user's data + jurisdiction-required disclosures
  // for dating apps (audit O-5 / C-3). Sits before profile-setup so
  // the user gives consent before any personal-data fields are collected.
  if (!hasAcceptedCurrentTerms(s.profile)) return '/(auth)/consent';
  if (!s.profile?.isProfileComplete) return '/(auth)/profile-setup';
  if (!s.profile?.verifiedSelfie) return '/(auth)/selfie-verify';
  if (!s.profile?.verifiedID) return '/(auth)/id-verify';
  // Location permission goes LAST — by this point the user has
  // invested in completing verification and is much more likely to
  // grant than they would have been upfront (audit O-7).
  if (!wasLocationPrompted(s.profile)) return '/(auth)/location-permission';
  return '/(tabs)';
};

/**
 * Whether the given (auth)-subroute is reachable in the user's current state.
 *
 * Unauthenticated users move through `onboarding → login → otp`, so any of
 * those three are valid. Each post-auth verification stage is one-screen,
 * so the allowed set collapses to one route.
 *
 * `editMode` opt-in: a fully-set-up user may legitimately re-open
 * `profile-setup` from Settings → Edit Profile. The layout passes
 * `editMode: true` when the URL carries `?edit=1` so the guard doesn't
 * bounce them back to /(tabs). The opt-in only applies once the user is
 * authenticated AND complete — an unauth deep link with `?edit=1` is still
 * routed to onboarding (the auth check runs first).
 *
 * Returns false for fully-verified users on any (auth) route — they belong
 * in /(tabs).
 */
export const isAllowedAuthRoute = (
  subroute: string,
  s: AuthGateInput,
  editMode = false
): boolean => {
  if (!s.isAuthenticated) {
    return subroute === 'onboarding' || subroute === 'login' || subroute === 'otp';
  }
  if (editMode && subroute === 'profile-setup' && s.profile?.isProfileComplete) {
    return true;
  }
  if (s.isEmailUser && s.emailVerified === false) {
    return subroute === 'verify-email';
  }
  if (!hasAcceptedCurrentTerms(s.profile)) return subroute === 'consent';
  if (!s.profile?.isProfileComplete) return subroute === 'profile-setup';
  if (!s.profile?.verifiedSelfie) return subroute === 'selfie-verify';
  if (!s.profile?.verifiedID) return subroute === 'id-verify';
  if (!wasLocationPrompted(s.profile)) return subroute === 'location-permission';
  return false;
};
