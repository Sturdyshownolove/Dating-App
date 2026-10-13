import functions from '@react-native-firebase/functions';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { db, Collections, serverTimestamp, toDate } from './firebase';
import { TierLevel } from '@/constants/tiers';

// ==================== User Types ====================
// Shape of the broadly-readable `users/{uid}` doc. Sensitive fields
// (pushToken, swipedUserIds, daily counters, precise coords) live in
// `users/{uid}/private/*` subcollection docs and are NOT typed here —
// reads of those go through admin-SDK paths in firebase/functions or
// dedicated owner-only client helpers. Keeping them off this type
// means a future PR can't accidentally re-introduce a top-level write
// via type inference.
export interface UserProfile {
  id: string;
  name: string;
  age: number;
  gender: string;
  bio: string;
  photos: string[];
  interests: string[];
  verifiedSelfie: boolean;
  verifiedID: boolean;
  // Public profile carries only the coarse city label — precise
  // coordinates live in `users/{uid}/private/location` (owner-only).
  // Discovery / cards consume this; distance-filter logic must read
  // the private doc via admin SDK in a Cloud Function.
  location: {
    city?: string | null;
  } | null;
  tierLevel: TierLevel;
  isProfileComplete: boolean;
  // T&C / privacy / age-confirmation consent (audit O-5). Version
  // bumps in `utils/authStage.ts:TERMS_VERSION` trigger a re-prompt
  // for users whose recorded version is older. Optional because
  // pre-O-5 user docs don't have the field; the gate's
  // `hasAcceptedCurrentTerms` predicate handles missing field as
  // "not consented".
  consent?: {
    version: number;
    acceptedAt: any;
  };
  // Timestamp of the one-time location-permission prompt (audit O-7).
  // Set whether the user clicked Allow or Skip — the value just
  // proves we've asked once so the gate doesn't re-pester. Users
  // can update permission later via Settings → Location Settings.
  locationPromptedAt?: any;
  createdAt: any;
  updatedAt: any;
  // Bucketed distance from the viewer ("< 1 km", "1–5 km", …) — set only on
  // profiles returned by the getDiscoveryFeed CF; never a raw coordinate.
  distanceLabel?: string;
}

export interface Match {
  id: string;
  userA: string;
  userB: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  isBlocked: boolean;
  lastMessage?: string;
  lastMessageAt?: Date;
}

export interface Swipe {
  id: string;
  fromUser: string;
  toUser: string;
  action: 'like' | 'pass' | 'superlike';
  createdAt: any;
}

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  imageUrl: string | null;
  timestamp: Date;
  seen: boolean;
}

// ==================== User Operations ====================
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const doc = await db.collection(Collections.USERS).doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as UserProfile;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

export const updateUserProfile = async (
  userId: string,
  data: Partial<UserProfile>
): Promise<boolean> => {
  try {
    await db.collection(Collections.USERS).doc(userId).update({
      ...data,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
};

/**
 * Mark that the user has been through the location-permission prompt
 * (audit O-7). Called by `location-permission.tsx` on both Allow and
 * Skip — the timestamp records the prompt happened, not the OS-level
 * grant outcome. Users can change OS permission later via system
 * Settings + the in-app "Location Settings" entry; the gate doesn't
 * pester them either way once asked.
 */
export const markLocationPrompted = async (userId: string): Promise<boolean> => {
  try {
    await db.collection(Collections.USERS).doc(userId).update({
      locationPromptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error marking location prompted:', error);
    return false;
  }
};

/**
 * Record the user's T&C / privacy / age-confirmation consent
 * (audit O-5). Writes `consent: { version, acceptedAt }` to the
 * user doc. Allowed by the existing user-doc update rule since
 * `consent` isn't in the admin-only fields list.
 *
 * Caller passes the TERMS_VERSION constant from `utils/authStage.ts`
 * to ensure the recorded version matches what the gate predicate
 * checks against.
 */
export const acceptTerms = async (
  userId: string,
  version: number
): Promise<boolean> => {
  try {
    await db.collection(Collections.USERS).doc(userId).update({
      consent: {
        version,
        acceptedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error recording consent:', error);
    return false;
  }
};

export const subscribeToUser = (
  userId: string,
  callback: (user: UserProfile | null) => void
) => {
  return db.collection(Collections.USERS).doc(userId).onSnapshot(
    (doc) => {
      if (doc.exists) {
        callback({ id: doc.id, ...doc.data() } as UserProfile);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error('User subscription error:', error);
      callback(null);
    }
  );
};

// ==================== Swipe Operations ====================

// Opaque discovery-feed cursor — a base64 (distance,uid) token minted by
// the getDiscoveryFeed CF. `null` = start of feed (first call) or no more
// results (when returned as `nextCursor`).
export type FeedCursor = string | null;

export interface FeedPage {
  profiles: UserProfile[];
  nextCursor: FeedCursor;
  // True when the viewer has no precise location on file — the distance
  // feed can't run; the caller should prompt to enable location.
  needsLocation?: boolean;
}

/**
 * One page of the discovery feed, via the `getDiscoveryFeed` Cloud Function
 * (server-side feed — 06_Reports/design_server_side_feed_2026-05-24, Phase 2).
 *
 * The CF reads the viewer's precise location (server-only), queries the
 * admin-only `discovery` index by geohash within the viewer's max-distance
 * preference, excludes already-swiped users SERVER-SIDE, filters by
 * gender/age prefs, ranks nearest-first, and returns public profile fields
 * + a bucketed `distanceLabel` (never raw coords). Pass `nextCursor` back to
 * page; `needsLocation` is true when the viewer has no coords yet.
 *
 * (uid is derived from the auth context server-side — no userId arg.)
 */
export const getNearbyProfiles = async (
  pageSize: number = 20,
  after: FeedCursor = null
): Promise<FeedPage> => {
  try {
    const callable = functions().httpsCallable('getDiscoveryFeed');
    const result = await callable({ limit: pageSize, cursor: after ?? undefined });
    const data = (result.data ?? {}) as {
      profiles?: UserProfile[];
      nextCursor?: string | null;
      needsLocation?: boolean;
    };
    return {
      profiles: data.profiles ?? [],
      nextCursor: data.nextCursor ?? null,
      needsLocation: data.needsLocation,
    };
  } catch (error) {
    console.error('Error fetching discovery feed:', error);
    return { profiles: [], nextCursor: null };
  }
};

/**
 * Calls the `swipeAction` HTTPS callable Cloud Function.
 * The function is the authoritative path — it owns the cap transaction, the
 * swipe doc create, and the reciprocal-match detection + match write. Firestore
 * rules deny client-side writes to `swipes/{id}` and to `users/{uid}` counter
 * fields, so this call cannot be bypassed.
 */
export const createSwipe = async (
  toUser: string,
  action: 'like' | 'pass' | 'superlike'
): Promise<{ matched: boolean; matchId?: string; capReached?: boolean }> => {
  try {
    const callable = functions().httpsCallable('swipeAction');
    const result = await callable({ toUser, action });
    return result.data as { matched: boolean; matchId?: string };
  } catch (error: any) {
    if (error?.code === 'resource-exhausted') {
      return { matched: false, capReached: true };
    }
    console.error('Error creating swipe:', error);
    return { matched: false };
  }
};

// ==================== Match Operations ====================
export const subscribeToMatches = (
  userId: string,
  callback: (matches: Match[]) => void
) => {
  // Two parallel realtime listeners — one for matches where the user is
  // userA, one for userB. Either side becomes the "first liker" depending
  // on swipe order, so a half-realtime implementation (one side polled
  // only when the other ticks) misses new matches on the polled side
  // until the next unrelated update or app restart.
  //
  // Each listener stores its latest snapshot docs in closure-local state
  // and re-emits a merged + deduped + sorted callback on every change.
  let docsA: FirebaseFirestoreTypes.QueryDocumentSnapshot[] = [];
  let docsB: FirebaseFirestoreTypes.QueryDocumentSnapshot[] = [];
  let haveA = false;
  let haveB = false;

  const emit = () => {
    // Wait for both listeners' first snapshot so the initial callback
    // doesn't fire with a half-loaded list (UI would flash empty for
    // userB-only users on cold start).
    if (!haveA || !haveB) return;

    const merged = new Map<string, Match>();
    for (const d of [...docsA, ...docsB]) {
      const data = d.data();
      merged.set(d.id, {
        id: d.id,
        userA: data.userA,
        userB: data.userB,
        createdAt: toDate(data.createdAt),
        expiresAt: toDate(data.expiresAt),
        isActive: data.isActive,
        isBlocked: data.isBlocked,
        lastMessage: data.lastMessage || '',
        lastMessageAt: data.lastMessageAt ? toDate(data.lastMessageAt) : undefined,
      } as Match);
    }
    const matches = Array.from(merged.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    callback(matches);
  };

  const unsubA = db
    .collection(Collections.MATCHES)
    .where('userA', '==', userId)
    .onSnapshot(
      (snap) => { docsA = snap.docs; haveA = true; emit(); },
      (err) => console.error('subscribeToMatches userA error:', err)
    );

  const unsubB = db
    .collection(Collections.MATCHES)
    .where('userB', '==', userId)
    .onSnapshot(
      (snap) => { docsB = snap.docs; haveB = true; emit(); },
      (err) => console.error('subscribeToMatches userB error:', err)
    );

  return () => { unsubA(); unsubB(); };
};

export const getMatchById = async (matchId: string): Promise<Match | null> => {
  try {
    const doc = await db.collection(Collections.MATCHES).doc(matchId).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    return {
      id: doc.id,
      userA: data.userA,
      userB: data.userB,
      createdAt: toDate(data.createdAt),
      expiresAt: toDate(data.expiresAt),
      isActive: data.isActive,
      isBlocked: data.isBlocked,
      lastMessage: data.lastMessage || '',
      lastMessageAt: data.lastMessageAt ? toDate(data.lastMessageAt) : undefined,
    } as Match;
  } catch (error) {
    console.error('Error fetching match:', error);
    return null;
  }
};

export const expireMatch = async (matchId: string): Promise<void> => {
  try {
    await functions().httpsCallable('endMatch')({ matchId });
  } catch (error) {
    console.error('Error expiring match:', error);
  }
};

