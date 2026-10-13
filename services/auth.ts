import { firebaseAuth, db, Collections, serverTimestamp } from './firebase';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import { checkPasswordBreached } from '@/utils/passwordSecurity';

export interface AuthResult {
  success: boolean;
  user?: FirebaseAuthTypes.User;
  verificationId?: string;
  error?: string;
}

// Phone Authentication
export const sendPhoneOTP = async (phoneNumber: string): Promise<AuthResult> => {
  try {
    const confirmation = await firebaseAuth.signInWithPhoneNumber(phoneNumber);
    return {
      success: true,
      verificationId: confirmation.verificationId ?? undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send OTP',
    };
  }
};

export const verifyPhoneOTP = async (
  verificationId: string,
  code: string
): Promise<AuthResult> => {
  try {
    const credential = auth.PhoneAuthProvider.credential(verificationId, code);
    const result = await firebaseAuth.signInWithCredential(credential);

    // Always run createUserDocument — it's internally idempotent (checks
    // doc.exists before writing). Pre-fix this gated on
    // `additionalUserInfo.isNewUser`, which left users stranded if the
    // first-OTP doc write failed: subsequent OTPs return isNewUser=false
    // and the doc never gets retried (audit S2-6). The extra get() for
    // returning users is negligible.
    if (result.user) {
      await createUserDocument(result.user);
    }

    return { success: true, user: result.user };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Invalid OTP code',
    };
  }
};

// Email Authentication
export const registerWithEmail = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  try {
    // HIBP k-anonymity breach check (S1-6 final). Fires BEFORE the
    // Firebase create so a breached password is rejected without
    // ever creating an account. Fails open on network errors (the
    // length + complexity rules from utils/validation.ts still apply
    // via the upstream caller).
    const breach = await checkPasswordBreached(password);
    if (breach.breached) {
      return {
        success: false,
        error: `This password has appeared in known data breaches (${breach.count.toLocaleString()} times). Please choose a different one.`,
      };
    }

    const result = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    if (result.user) {
      await createUserDocument(result.user);
      // Fire-and-forget: send the Firebase verification email so the
      // user can prove control of the address. Failure is non-blocking
      // (network glitch, rate-limit). The `resendEmailVerification`
      // helper below gives the user a way to retry from the UI when
      // the verify-email screen lands (S1-5 phase 2).
      result.user.sendEmailVerification().catch((err) =>
        console.warn('sendEmailVerification on register failed:', err)
      );
    }
    return { success: true, user: result.user };
  } catch (error: any) {
    // Form-validation codes stay specific because they describe what the
    // user typed, not whether the account exists. Account-existence codes
    // (`email-already-in-use`, plus the related `account-exists-with-
    // different-credential`) collapse to a single non-enumerating message
    // so an attacker can't iterate a list of emails through this endpoint
    // and learn which have accounts. Audit S1-4.
    let errorMessage = 'Unable to create account. Please try a different email or sign in.';
    if (error.code === 'auth/weak-password') {
      // Mirror the app policy (utils/validation.ts:validatePassword): 10
      // chars + upper/lower/digit. Firebase's own `weak-password` only
      // fires for <6 chars and client validation rejects <10 first, so
      // this is a rarely-hit safety net — keep it accurate, not stale.
      errorMessage =
        'Password must be at least 10 characters and include an uppercase letter, a lowercase letter, and a number';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address';
    }
    return { success: false, error: errorMessage };
  }
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<AuthResult> => {
  try {
    const result = await firebaseAuth.signInWithEmailAndPassword(email, password);
    return { success: true, user: result.user };
  } catch (error: any) {
    // Same non-enumeration posture as registerWithEmail (audit S1-4 + S2-7).
    // Anything that would let an attacker distinguish account-state classes
    // collapses to the same "Invalid email or password" string:
    //   - user-not-found        → no such account
    //   - wrong-password        → account exists, password wrong
    //   - invalid-credential    → newer-Firebase union of the above two
    //   - user-disabled         → account exists but admin-disabled
    //   - account-exists-with-different-credential → email is linked to
    //     a different auth provider (phone, Apple, Google)
    // `too-many-requests` stays specific — it's the same message for every
    // attempt regardless of which account is targeted, so not an enum signal.
    let errorMessage = 'Invalid email or password';
    if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many attempts. Try again later.';
    }
    return { success: false, error: errorMessage };
  }
};

/**
 * Re-send the Firebase verification email for the currently-signed-in
 * email-method user. UI affordance for users who didn't receive the
 * initial email or let the link expire. Returns success=false for
 * phone-method users (no email on the account) or when unauthenticated.
 */
export const resendEmailVerification = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  const user = firebaseAuth.currentUser;
  if (!user || !user.email) {
    return { success: false, error: 'No email on this account.' };
  }
  if (user.emailVerified) {
    return { success: false, error: 'Email already verified.' };
  }
  try {
    await user.sendEmailVerification();
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many requests. Try again later.' };
    }
    return { success: false, error: error?.message || 'Failed to send verification email.' };
  }
};

/**
 * Force-refresh the current Firebase user from the server. Required to
 * pick up `emailVerified=true` after the user clicks the link — the
 * SDK caches the value otherwise. Phase 2's verify-email screen will
 * poll this periodically + auto-advance when verified flips.
 */
export const reloadFirebaseUser = async (): Promise<void> => {
  const user = firebaseAuth.currentUser;
  if (!user) return;
  try { await user.reload(); } catch (err) {
    console.warn('reloadFirebaseUser failed:', err);
  }
};

// Session Management
export const signOut = async (): Promise<void> => {
  await firebaseAuth.signOut();
};

/**
 * Re-auth gate for sensitive operations (account deletion today; could
 * extend to email/password change). Required because the persistent
 * Firebase auth session means a briefly-unlocked phone is enough to
 * destroy the user's account via the existing UI. With this gate, an
 * attacker also needs the current password.
 *
 * Email-method users only — for phone users, OTP re-send is the
 * equivalent flow (phase 2; not yet wired). Returns success=false if
 * the user isn't an email-method user so the caller can branch.
 */
export const reauthenticateWithPassword = async (
  password: string
): Promise<{ success: boolean; error?: string }> => {
  const user = firebaseAuth.currentUser;
  if (!user || !user.email) {
    return { success: false, error: 'No email-method user signed in.' };
  }
  try {
    const cred = auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(cred);
    return { success: true };
  } catch (error: any) {
    // Same non-enumerating posture as loginWithEmail — collapse
    // wrong-password / invalid-credential / etc to a single message.
    if (error?.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many attempts. Try again later.' };
    }
    return { success: false, error: 'Incorrect password.' };
  }
};

/**
 * Whether the current Firebase user signed in via email/password
 * (vs phone). Used by the re-auth gate to branch UI.
 */
export const isEmailMethodUser = (): boolean => {
  const user = firebaseAuth.currentUser;
  return !!user?.providerData.some((p) => p.providerId === 'password');
};

/**
 * Re-authenticate via phone-OTP credential. Phone-method counterpart
 * to `reauthenticateWithPassword`. Caller is responsible for first
 * calling `sendPhoneOTP(user.phoneNumber)` to get the verificationId;
 * this function consumes the (verificationId, code) pair and proves
 * possession of the phone to Firebase.
 *
 * S1-10 phase 2 — closes the briefly-unlocked-phone account-deletion
 * vector for phone-method users.
 */
export const reauthenticateWithPhone = async (
  verificationId: string,
  code: string
): Promise<{ success: boolean; error?: string }> => {
  const user = firebaseAuth.currentUser;
  if (!user) {
    return { success: false, error: 'Not signed in.' };
  }
  try {
    const cred = auth.PhoneAuthProvider.credential(verificationId, code);
    await user.reauthenticateWithCredential(cred);
    return { success: true };
  } catch (error: any) {
    if (error?.code === 'auth/too-many-requests') {
      return { success: false, error: 'Too many attempts. Try again later.' };
    }
    // Same non-enumerating posture as the password path — collapse
    // wrong-code / expired-code / etc to one message.
    return { success: false, error: 'Incorrect or expired code.' };
  }
};

/**
 * Whether the current Firebase user signed in via phone. Used by
 * the re-auth gate to branch into the OTP flow.
 */
export const isPhoneMethodUser = (): boolean => {
  const user = firebaseAuth.currentUser;
  return !!user?.providerData.some((p) => p.providerId === 'phone');
};

/**
 * GDPR Art. 17 / App Store 5.1.1(v) — server-authoritative account erase.
 *
 * Delegates to the `deleteMyAccount` Cloud Function which cascades all
 * first-party data (private subcollection, swipes both sides, matches +
 * messages, reports, user doc) and then deletes the Firebase Auth user.
 * The local sign-out at the end is best-effort: by the time the CF
 * returns, the auth user is already gone server-side and the next
 * `onAuthStateChanged` tick will flip `isAuthenticated` to false anyway.
 */
export const deleteAccount = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const callable = functions().httpsCallable('deleteMyAccount');
    await callable({});
    try { await firebaseAuth.signOut(); } catch { /* user is gone server-side */ }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Account deletion failed' };
  }
};

/**
 * GDPR Art. 15 — caller's personal data, delivered inline OR via a
 * signed Storage URL when the payload exceeds the inline cap.
 *
 * The CF returns a discriminated union:
 *   { inline: true,  data: <full payload> }
 *   { inline: false, url: string, expiresAt: ISO string }   // 1h TTL
 *
 * Caller (settings.tsx) branches on `inline` and either shares the
 * JSON via RN Share or opens the URL via Linking.
 */
export type ExportResult =
  | { inline: true; data: any }
  | { inline: false; url: string; expiresAt: string };

export const exportAccount = async (): Promise<
  { success: true; data: ExportResult } | { success: false; error: string }
> => {
  try {
    const callable = functions().httpsCallable('exportMyAccount');
    const result = await callable({});
    return { success: true, data: result.data as ExportResult };
  } catch (error: any) {
    return { success: false, error: error.message || 'Data export failed' };
  }
};

export const getCurrentUser = (): FirebaseAuthTypes.User | null => {
  return firebaseAuth.currentUser;
};

export const onAuthStateChanged = (
  callback: (user: FirebaseAuthTypes.User | null) => void
) => {
  return firebaseAuth.onAuthStateChanged(callback);
};

// Create user document in Firestore
const createUserDocument = async (user: FirebaseAuthTypes.User): Promise<void> => {
  const userRef = db.collection(Collections.USERS).doc(user.uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    // Counter + swipe-history fields used to be seeded here at top
    // level (swipesUsedToday / boostsUsedToday / superLikesUsedToday /
    // lastSwipeReset / swipedUserIds). They now live in
    // `users/{uid}/private/state` (owner-only) — swipeAction creates
    // the doc on first swipe via `set+merge`, so no seed needed.
    // Same for `pushToken` (now `users/{uid}/private/push`).
    // Seeding them at top level would have re-introduced the broad-
    // read leaks the migrations closed.
    await userRef.set({
      id: user.uid,
      name: '',
      age: 0,
      gender: '',
      bio: '',
      photos: [],
      interests: [],
      verifiedSelfie: false,
      verifiedID: false,
      location: null,
      tierLevel: 'FREE',
      isProfileComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
};
