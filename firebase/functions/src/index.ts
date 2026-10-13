import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// Audit log — compliance + incident-response trail. Records
// significant data-subject events (account deletion / export,
// verification attempts, tier changes, match-end). Schema:
//   eventType: string
//   uid:       string       // subject of the event
//   actorUid?: string       // initiator (== uid for self-acts)
//   timestamp: serverTimestamp
//   outcome:   'success' | 'failure'
//   metadata:  object       // event-specific, NO bulk PII
//   error?:    string       // when outcome=failure
//
// Best-effort: failure to write the audit row never blocks the
// primary action. Caller code does its real work, then fires this
// in a try/catch.
//
// Firestore rule denies all client read/write on audit_log/{id}.
// Operator reads will need a custom-claim gate when the admin
// console lands.
// ============================================================

type AuditEventType =
  | 'account_deleted'
  | 'account_exported'
  | 'verification_attempt'
  | 'tier_synced'
  | 'match_ended';

const writeAuditLog = async (
  eventType: AuditEventType,
  uid: string,
  outcome: 'success' | 'failure',
  metadata: Record<string, any> = {},
  error?: string
): Promise<void> => {
  try {
    await db.collection('audit_log').add({
      eventType,
      uid,
      actorUid: uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      outcome,
      metadata,
      ...(error ? { error: error.substring(0, 500) } : {}),
    });
  } catch (err) {
    // Audit write failing must not break the primary action. Log it
    // for ops triage; the operation continues.
    console.error('writeAuditLog failed', { eventType, uid, outcome }, err);
  }
};

// ============================================================
// Push-token lookup. Primary location is the owner-only
// `users/{uid}/private/push` doc — the broad `users` read rule
// would otherwise expose the token to any signed-in user, and
// Expo's push API is unauthenticated (possession = ability to
// send), so leaked tokens are an active abuse vector, not just
// info exposure.
//
// Falls back to the legacy top-level `users/{uid}.pushToken`
// so devices written by older clients keep receiving pushes
// until they re-register on next launch.
// ============================================================
const getPushTokenForUser = async (uid: string): Promise<string | null> => {
  try {
    const privateDoc = await db
      .collection('users').doc(uid)
      .collection('private').doc('push')
      .get();
    const t = privateDoc.data()?.token;
    if (typeof t === 'string' && t.length > 0) return t;
  } catch (err) {
    console.warn('private push token read failed for', uid, err);
  }
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const t = userDoc.data()?.pushToken;
    return typeof t === 'string' && t.length > 0 ? t : null;
  } catch {
    return null;
  }
};

// ============================================================
// Push delivery — Expo Push API.
//
//   The client registers via expo-notifications'
//   getExpoPushTokenAsync(), which returns an Expo push token
//   (`ExponentPushToken[...]`). Those are NOT FCM registration
//   tokens, so the prior `admin.messaging().sendEachForMulticast()`
//   path REJECTED every one of them — all match / expiry / warning
//   pushes silently failed. Expo's REST API accepts these tokens and
//   fans out to FCM (Android) + APNs (iOS) using the credentials
//   configured in the Expo/EAS project.
//
//   Ops prerequisite for delivery (not code): upload the FCM server
//   key (Android) and an APNs key (iOS) to the Expo project —
//   `expo credentials` / EAS dashboard. Without that, Expo accepts
//   the request but can't deliver.
//
//   Batch limit is 100 messages/request; our callers send ≤2 tokens
//   (the two match participants) per call, so no chunking needed.
// ============================================================
const sendExpoPush = async (
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  channelId?: string
): Promise<void> => {
  // Drop anything that isn't an Expo token (empty strings written on
  // logout, legacy/malformed values). Expo rejects the whole batch on a
  // single bad token otherwise.
  const valid = tokens.filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken')
  );
  if (valid.length === 0) return;

  const messages = valid.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    ...(channelId ? { channelId } : {}),
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.error('Expo push send non-OK:', res.status, await res.text());
    }
  } catch (e) {
    console.error('Expo push send failed:', e);
  }
};

// ============================================================
// 1. ON MATCH CREATED — Schedule timer warning notification
// ============================================================
export const onMatchCreated = functions.firestore
  .document('matches/{matchId}')
  .onCreate(async (snapshot, context) => {
    const match = snapshot.data();
    const matchId = context.params.matchId;

    if (!match) return;

    const { userA, userB } = match;

    // Push tokens live in the owner-only private subcollection — see
    // getPushTokenForUser. Legacy fall-back keeps zero-downtime rollout.
    const [aToken, bToken] = await Promise.all([
      getPushTokenForUser(userA),
      getPushTokenForUser(userB),
    ]);

    const tokens: string[] = [];
    if (aToken) tokens.push(aToken);
    if (bToken) tokens.push(bToken);

    if (tokens.length > 0) {
      await sendExpoPush(
        tokens,
        "🔥 It's a Fuuk'Up!",
        'You have a new match! Start chatting before time runs out.',
        { matchId, type: 'new_match' },
        'matches'
      );
    }

    console.log(`Match ${matchId} created between ${userA} and ${userB}`);
  });

// ============================================================
// 2. AUTO-EXPIRE — Runs every minute to expire timed-out matches
// ============================================================
export const autoExpireMatches = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // Query active matches that have expired
    const expiredSnap = await db
      .collection('matches')
      .where('isActive', '==', true)
      .where('isBlocked', '==', false)
      .where('expiresAt', '<=', now)
      .limit(100)
      .get();

    if (expiredSnap.empty) {
      console.log('No expired matches found.');
      return null;
    }

    const batch = db.batch();
    const expiredMatches: { matchId: string; userA: string; userB: string }[] = [];

    expiredSnap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isActive: false,
        isBlocked: true,
      });
      const data = doc.data();
      expiredMatches.push({
        matchId: doc.id,
        userA: data.userA,
        userB: data.userB,
      });
    });

    await batch.commit();
    console.log(`Expired ${expiredMatches.length} matches.`);

    // Send expiry notifications
    for (const match of expiredMatches) {
      try {
        const [userAToken, userBToken] = await Promise.all([
          getPushTokenForUser(match.userA),
          getPushTokenForUser(match.userB),
        ]);

        const tokens: string[] = [];
        if (userAToken) tokens.push(userAToken);
        if (userBToken) tokens.push(userBToken);

        if (tokens.length > 0) {
          await sendExpoPush(
            tokens,
            "⏰ Time's Up!",
            'Your match has expired. Keep swiping to find new connections!',
            { matchId: match.matchId, type: 'match_expired' },
            'timer'
          );
        }
      } catch (error) {
        console.error(`Error sending expiry notification for ${match.matchId}:`, error);
      }
    }

    return null;
  });

// ============================================================
// 3. TIMER WARNING — 10 minutes before expiry
// ============================================================
export const timerWarningCheck = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const tenMinLater = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 10 * 60 * 1000
    );

    // Find active matches expiring in the next 10 minutes
    const warningSnap = await db
      .collection('matches')
      .where('isActive', '==', true)
      .where('isBlocked', '==', false)
      .where('expiresAt', '>', now)
      .where('expiresAt', '<=', tenMinLater)
      .limit(100)
      .get();

    if (warningSnap.empty) return null;

    for (const doc of warningSnap.docs) {
      const data = doc.data();

      // Skip if already warned
      if (data.warningNotificationSent) continue;

      const [aToken, bToken] = await Promise.all([
        getPushTokenForUser(data.userA),
        getPushTokenForUser(data.userB),
      ]);

      const tokens: string[] = [];
      if (aToken) tokens.push(aToken);
      if (bToken) tokens.push(bToken);

      if (tokens.length > 0) {
        await sendExpoPush(
          tokens,
          '⏰ 10 Minutes Left!',
          'Your match is about to expire. Send a message now!',
          { matchId: doc.id, type: 'timer_warning' },
          'timer'
        );
      }

      // Mark as warned
      await doc.ref.update({ warningNotificationSent: true });
    }

    return null;
  });

// ============================================================
// DAILY SWIPE RESET — removed 2026-05-24.
//   The former `resetDailySwipes` pubsub cron reset top-level
//   `users/{uid}.swipesUsedToday`/etc. After the counter-migration
//   ([[security_counters_private_2026-05-24]]) those counters live in
//   `users/{uid}/private/state`, which the cron never touched — it had
//   become a dead no-op querying an unwritten field. The per-day reset
//   is owned authoritatively by swipeAction's `isNewDay` branch below
//   (lazy reset on first swipe of a new UTC day). See
//   [[backend_match_idempotency_guard_2026-05-24]] for the flag.
// ============================================================

// ============================================================
// SWIPE ACTION — HTTPS callable. Authoritative swipe path.
//    Replaces client-side transaction so swipesUsedToday + the
//    swipes collection can be locked to admin-only in rules.
//    Also writes the match doc server-side on reciprocal like.
// ============================================================

// Mirror of `constants/tiers.ts` (client-side source of truth).
// Kept inline to avoid wiring a shared package; update both when changing.
const TIER_CAPS: Record<string, { swipesPerDay: number; duration: number }> = {
  FREE:    { swipesPerDay: 20,       duration: 3600 },
  TIER_1:  { swipesPerDay: Infinity, duration: 7200 },
  TIER_2:  { swipesPerDay: Infinity, duration: 21600 },
  TIER_3:  { swipesPerDay: Infinity, duration: 86400 },
};

// Bound the denormalized swiped-history array on the user doc. 5000 keeps
// each doc well under Firestore's 1 MiB limit and the JS filter cheap. Beyond
// this cap, oldest entries drop out — the user may re-encounter very old
// swipes, which is acceptable.
const MAX_SWIPED_USERS = 5000;

const todayStartUtcMs = (): number => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

type SwipeAction = 'like' | 'pass' | 'superlike';

export const swipeAction = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const fromUser = context.auth.uid;
  const toUser = data?.toUser;
  const action = data?.action as SwipeAction;

  if (typeof toUser !== 'string' || toUser.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'toUser is required.');
  }
  if (toUser === fromUser) {
    throw new functions.https.HttpsError('invalid-argument', 'cannot swipe self.');
  }
  if (action !== 'like' && action !== 'pass' && action !== 'superlike') {
    throw new functions.https.HttpsError('invalid-argument', 'action must be like/pass/superlike.');
  }

  const userRef = db.collection('users').doc(fromUser);
  // `users/{uid}/private/state` holds all per-user counters that used
  // to live on the broadly-readable user doc:
  //   - swipedUserIds (dating-preference leak)
  //   - swipesUsedToday / boostsUsedToday / superLikesUsedToday
  //     (activity-level intel)
  //   - lastSwipeReset
  // Pattern from [[push-token]] / [[location]] migrations — owner-only
  // read+write, admin SDK bypasses. The user doc keeps only verified
  // flags + tierLevel + profile fields (name/age/photos/...).
  const privateStateRef = userRef.collection('private').doc('state');
  const swipeRef = db.collection('swipes').doc();

  // Transaction: cap + counter + swipe.
  // The `isNewDay` branch below is the sole owner of the per-day counter
  // reset (lazy, on first swipe of a new UTC day) — there is no longer a
  // separate reset cron. See the DAILY SWIPE RESET note above.
  await db.runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef);
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'user doc missing.');
    }
    // Read private state inside the transaction so concurrent swipes
    // serialize correctly. Missing doc is fine — treated as empty.
    const privateDoc = await tx.get(privateStateRef);

    const u = userDoc.data() as any;
    const p = (privateDoc.data() as any) ?? {};

    if (!u.verifiedSelfie || !u.verifiedID) {
      throw new functions.https.HttpsError('failed-precondition', 'verification required.');
    }
    const tier = (u.tierLevel as string) ?? 'FREE';
    const cap = TIER_CAPS[tier]?.swipesPerDay ?? TIER_CAPS.FREE.swipesPerDay;

    // Counters read from private with legacy fallback. After all active
    // users have done one post-deploy swipe, the legacy fields on the
    // user doc become stale (still written by createUserDocument? — no,
    // that's cleaned up in this same task). Eventually-empty fallback
    // is acceptable.
    const lastResetMs =
      p.lastSwipeReset?.toMillis?.() ??
      u.lastSwipeReset?.toMillis?.() ??
      0;
    const isNewDay = lastResetMs < todayStartUtcMs();
    const used = isNewDay
      ? 0
      : (typeof p.swipesUsedToday === 'number'
          ? p.swipesUsedToday
          : (u.swipesUsedToday ?? 0));

    if (Number.isFinite(cap) && used >= cap) {
      throw new functions.https.HttpsError('resource-exhausted', 'Daily swipe limit reached.');
    }

    // Merge private + legacy top-level swipedUserIds during the
    // migration window. Once all active users have at least one
    // post-deploy swipe, the legacy field is stale; a future cleanup
    // pass can clear it.
    const fromPrivate: string[] = Array.isArray(p.swipedUserIds) ? p.swipedUserIds : [];
    const fromLegacy: string[] = Array.isArray(u.swipedUserIds) ? u.swipedUserIds : [];
    const mergedSeen = new Set<string>([...fromPrivate, ...fromLegacy]);
    const merged = Array.from(mergedSeen);
    const nextSwiped = mergedSeen.has(toUser)
      ? merged
      : [...merged, toUser].slice(-MAX_SWIPED_USERS);

    // All counter + swiped state goes to private/state via set+merge.
    // No userRef writes from swipeAction anymore — the user doc keeps
    // only profile data and the verified/tier flags (the latter
    // written by other CFs).
    tx.set(
      privateStateRef,
      {
        swipedUserIds: nextSwiped,
        swipesUsedToday: used + 1,
        ...(isNewDay
          ? { lastSwipeReset: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
      },
      { merge: true }
    );
    tx.set(swipeRef, {
      fromUser,
      toUser,
      action,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Reciprocal-match detection (only for like/superlike).
  // Moves the 5 round-trips off the client; matches doc created with admin SDK.
  if (action === 'like' || action === 'superlike') {
    const reverse = await db
      .collection('swipes')
      .where('fromUser', '==', toUser)
      .where('toUser', '==', fromUser)
      .where('action', 'in', ['like', 'superlike'])
      .limit(1)
      .get();

    if (!reverse.empty) {
      // Idempotency guard. A reciprocal like is reachable more than once
      // for the same pair — a retried / double-tapped swipeAction call,
      // or near-simultaneous mutual likes. Without this check each path
      // reaches `matches.add` and creates a *duplicate* match doc (two
      // chat rooms, two timers, and onMatchCreated firing a second
      // "It's a match" push). Reuse any existing live match for the pair.
      //
      // pairKey is a deterministic sorted-uid key; the equality query is
      // served by Firestore's automatic single-field index (no composite
      // index to declare/deploy). Matches created before this field
      // existed won't be found here, but matches expire within ≤24h so
      // that legacy window self-drains. The pre-write query is not
      // transactional with the create, so a truly simultaneous race is
      // not fully closed — but the reachable retry/double-tap path is.
      const pairKey = [fromUser, toUser].sort().join('_');
      const nowMs = Date.now();
      const existingForPair = await db
        .collection('matches')
        .where('pairKey', '==', pairKey)
        .get();
      const liveMatch = existingForPair.docs.find((d) => {
        const m = d.data();
        const notExpired = (m.expiresAt?.toMillis?.() ?? 0) > nowMs;
        return m.isActive === true && m.isBlocked === false && notExpired;
      });
      if (liveMatch) {
        return { matched: true, matchId: liveMatch.id };
      }

      const [userADoc, userBDoc] = await Promise.all([
        db.collection('users').doc(fromUser).get(),
        db.collection('users').doc(toUser).get(),
      ]);
      const aTier = (userADoc.data()?.tierLevel as string) ?? 'FREE';
      const bTier = (userBDoc.data()?.tierLevel as string) ?? 'FREE';
      const duration = Math.max(
        TIER_CAPS[aTier]?.duration ?? 3600,
        TIER_CAPS[bTier]?.duration ?? 3600
      );

      const matchRef = await db.collection('matches').add({
        userA: fromUser,
        userB: toUser,
        pairKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + duration * 1000),
        isActive: true,
        isBlocked: false,
        lastMessage: '',
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { matched: true, matchId: matchRef.id };
    }
  }

  return { matched: false };
});

// ============================================================
// 6. VERIFY ME — HTTPS callable. Stub passthrough.
//    Unblocks deployment of the users/{uid} field lock (rule denies
//    client writes to verifiedSelfie / verifiedID); the admin SDK
//    inside this CF bypasses the rule.
//
//    ⚠️ STUB. Mirrors the prior client-side stub in services/verification.ts.
//    The body becomes a vendor-SDK webhook handler when audit S3 / V-1
//    is closed (Persona or Onfido). Today this CF gives no security
//    improvement on the verification decision itself: any signed-in
//    user can call it and mark themselves verified. The only delta vs.
//    pre-CF behaviour is that the writer is now the admin SDK, which
//    lets the firestore.rules lock deploy without breaking the app.
//    See 06_Reports/security_rule_deploy_block_2026-05-17.md.
// ============================================================
export const verifyMe = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const kind = data?.kind;
  if (kind !== 'selfie' && kind !== 'id') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'kind must be "selfie" or "id".'
    );
  }

  // Preserves the ~2s latency of the prior client-side stub so the
  // verification screens' spinner UX is unchanged.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const field = kind === 'selfie' ? 'verifiedSelfie' : 'verifiedID';
  try {
    await db.collection('users').doc(context.auth.uid).update({
      [field]: true,
    });
  } catch (err: any) {
    await writeAuditLog('verification_attempt', context.auth.uid, 'failure',
      { kind }, err?.message);
    throw err;
  }

  // Audit trail — when vendor SDK replaces the stub, the metadata will
  // also carry provider session ID + confidence score.
  await writeAuditLog('verification_attempt', context.auth.uid, 'success', { kind });

  return { ok: true };
});

// ============================================================
// 7. SYNC TIER FROM ENTITLEMENTS — HTTPS callable.
//    Authoritative tier write. Replaces the prior client-side
//    updateUserProfile(userId, { tierLevel }) so the users/{uid}
//    tierLevel field can be locked admin-only in firestore.rules.
//
//    Source of truth = RevenueCat REST API. Client triggers the
//    sync (after purchase / restore); CF fetches the subscriber's
//    active entitlements server-side and writes the derived tier.
//    Client cannot forge a tier — the only thing the call says is
//    "please re-check my entitlements from RC."
//
//    Setup (user action required before deploy):
//      firebase functions:config:set \
//        revenuecat.secret_api_key="sec_xxx_v2_key"
//    Key comes from RC dashboard → Project Settings → API Keys →
//    Secret V2 (NOT the public SDK key used in the mobile bundle).
//
//    Refunds / billing-issue events that don't go through a
//    client purchase/restore are out of scope here — defense in
//    depth via an RC webhook handler is a separate follow-up.
// ============================================================

type Tier = 'FREE' | 'TIER_1' | 'TIER_2' | 'TIER_3';

const tierFromRcEntitlements = (entitlements: Record<string, any>): Tier => {
  const now = Date.now();
  const isActive = (ent: any) =>
    ent?.expires_date == null ||
    new Date(ent.expires_date).getTime() > now;

  if (entitlements?.['platinum'] && isActive(entitlements['platinum'])) return 'TIER_3';
  if (entitlements?.['gold']     && isActive(entitlements['gold']))     return 'TIER_2';
  if (entitlements?.['silver']   && isActive(entitlements['silver']))   return 'TIER_1';
  return 'FREE';
};

export const syncTierFromEntitlements = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const rcSecret = functions.config().revenuecat?.secret_api_key;
  if (!rcSecret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'RevenueCat secret API key not configured. Set revenuecat.secret_api_key in functions config.'
    );
  }

  const uid = context.auth.uid;
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${rcSecret}` },
    });
  } catch (error) {
    console.error('RC REST fetch failed:', error);
    throw new functions.https.HttpsError('unavailable', 'RevenueCat unreachable.');
  }

  // 404 = subscriber doesn't exist yet in RC (no purchase ever made). Treat as FREE.
  let tier: Tier;
  if (response.status === 404) {
    tier = 'FREE';
  } else if (!response.ok) {
    console.error('RC REST non-OK:', response.status);
    throw new functions.https.HttpsError('internal', `RC API ${response.status}`);
  } else {
    const payload = (await response.json()) as { subscriber?: { entitlements?: Record<string, any> } };
    tier = tierFromRcEntitlements(payload?.subscriber?.entitlements ?? {});
  }

  // Read prior tier before overwriting so the audit row captures the
  // transition (FREE → TIER_2, etc.).
  const prevTier = (await db.collection('users').doc(uid).get()).data()?.tierLevel ?? 'FREE';
  await db.collection('users').doc(uid).update({ tierLevel: tier });
  await writeAuditLog('tier_synced', uid, 'success', { fromTier: prevTier, toTier: tier });
  return { tier };
});

// ============================================================
// 8. SIGN UPLOAD — HTTPS callable. Cloudinary signed-upload params.
//    Replaces the unsigned `fuukup_preset` flow in services/storage.ts.
//    Closes audit S5 (unsigned preset abusable for arbitrary uploads).
//
//    Does NOT close S4 (PII URLs world-readable) — delivery URLs are
//    unchanged. Closing S4 requires either Cloudinary authenticated
//    delivery type or migration to Firebase Storage. Separate task.
//
//    Setup (user action required before functions deploy):
//      firebase functions:config:set \
//        cloudinary.cloud_name="dsobcz00x" \
//        cloudinary.api_key="<from Cloudinary dashboard>" \
//        cloudinary.api_secret="<from Cloudinary dashboard>"
//
//    Cloudinary dashboard (Phase 1, required to bound bandwidth abuse):
//      - max_file_size 10 MB
//      - restrict formats: jpg / png / webp
//      - enable strict transformations
//      - (optional) AWS Rek SafeSearch eager moderation
// ============================================================

const CLOUDINARY_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

type UploadKind = 'photo' | 'chat' | 'verification';

// Cloudinary signature spec:
//   1. Sort params alphabetically by key
//   2. Build "k1=v1&k2=v2&..." (no URL-encoding of values)
//   3. Append API secret
//   4. SHA1 hex digest
function cloudinarySig(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}=${params[k]}`).join('&') + apiSecret;
  return crypto.createHash('sha1').update(toSign).digest('hex');
}

export const signUpload = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }

  const cloudName = functions.config().cloudinary?.cloud_name;
  const apiKey = functions.config().cloudinary?.api_key;
  const apiSecret = functions.config().cloudinary?.api_secret;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cloudinary config not set. See deploy docs.'
    );
  }

  const kind = data?.kind as UploadKind;
  const mime = data?.mime as string;
  const matchId = data?.matchId as string | undefined;

  if (kind !== 'photo' && kind !== 'chat' && kind !== 'verification') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'kind must be "photo", "chat", or "verification".'
    );
  }
  if (!CLOUDINARY_ALLOWED_MIMES.includes(mime)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `mime must be one of ${CLOUDINARY_ALLOWED_MIMES.join(', ')}.`
    );
  }

  const uid = context.auth.uid;
  let folder: string;

  if (kind === 'photo') {
    folder = `users/${uid}/photos`;
  } else if (kind === 'verification') {
    folder = `users/${uid}/verification`;
  } else {
    // chat — caller must be an active participant in the match.
    if (typeof matchId !== 'string' || matchId.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'matchId required for chat uploads.'
      );
    }
    const matchSnap = await db.collection('matches').doc(matchId).get();
    if (!matchSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'match not found.');
    }
    const m = matchSnap.data()!;
    if (m.userA !== uid && m.userB !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'not a participant.');
    }
    if (m.isActive !== true || m.isBlocked === true) {
      throw new functions.https.HttpsError('failed-precondition', 'match not active.');
    }
    folder = `chats/${matchId}`;
  }

  // Server-chosen public_id so the client can't tamper with the destination.
  const publicId = `${Date.now()}_${uid.substring(0, 8)}`;
  const timestamp = Math.round(Date.now() / 1000);
  // `fl_strip_profile` strips EXIF + IPTC + XMP + ICC metadata at
  // ingest. Closes audit S2-1 for any image that goes through this
  // Cloudinary path (today: profile photos; chat is on Firebase
  // Storage and gets stripped post-upload via the storage trigger
  // below). Signed because Cloudinary's signature check rejects any
  // mismatch between signed and posted params.
  const transformation = 'fl_strip_profile';
  const signature = cloudinarySig(
    { folder, public_id: publicId, timestamp, transformation },
    apiSecret
  );

  return {
    cloud_name: cloudName,
    api_key: apiKey,
    folder,
    public_id: publicId,
    timestamp,
    transformation,
    signature,
  };
});

// ============================================================
// 9. END MATCH — HTTPS callable. Manual / user-initiated expire.
//    Replaces the prior client-side `services/firestore.ts:expireMatch`
//    direct write. Required so matches/{id}.isActive / isBlocked can
//    later be locked admin-only in firestore.rules (closes the
//    early-expire grief vector flagged in
//    06_Reports/security_matches_update_lock_2026-05-17.md).
//
//    Idempotent: returns ok=true for already-expired matches.
// ============================================================
export const endMatch = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const matchId = data?.matchId;
  if (typeof matchId !== 'string' || matchId.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'matchId is required.');
  }

  const matchRef = db.collection('matches').doc(matchId);
  const matchDoc = await matchRef.get();
  if (!matchDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'match not found.');
  }
  const m = matchDoc.data()!;
  if (m.userA !== context.auth.uid && m.userB !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'not a participant.');
  }

  if (m.isActive === false || m.isBlocked === true) {
    return { ok: true, alreadyExpired: true };
  }

  await matchRef.update({
    isActive: false,
    isBlocked: true,
  });

  await writeAuditLog('match_ended', context.auth.uid, 'success', {
    matchId,
    counterparty: m.userA === context.auth.uid ? m.userB : m.userA,
    reason: 'user_initiated',
  });

  return { ok: true };
});

// ============================================================
// 10. ON MESSAGE CREATE — Firestore trigger. Updates parent match's
//     lastMessage / lastMessageAt server-side.
//
//     Replaces the prior client-side write in services/chat.ts. Required
//     so matches/{id}.lastMessage / lastMessageAt can later be locked
//     admin-only in firestore.rules.
//
//     Does NOT enforce match expiry — that's handled by autoExpireMatches
//     (every 1 minute) + the message-create rule's isActive check. There
//     is a sub-minute window where a stale-expired match can accept one
//     message before autoExpireMatches flips it; acceptable trade-off vs.
//     this trigger pulling double duty.
// ============================================================
export const onMessageCreate = functions.firestore
  .document('matches/{matchId}/messages/{messageId}')
  .onCreate(async (snapshot, context) => {
    const message = snapshot.data();
    if (!message) return;

    const matchId = context.params.matchId;
    const text = typeof message.text === 'string' ? message.text : '';
    const preview = message.imageUrl
      ? '📷 Photo'
      : text.trim().substring(0, 100);

    try {
      await db.collection('matches').doc(matchId).update({
        lastMessage: preview,
        lastMessageAt: message.timestamp ?? admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error('onMessageCreate parent-update failed:', matchId, error);
    }
  });

// ============================================================
// 11. DELETE MY ACCOUNT — HTTPS callable. GDPR Art. 17 + App Store
//     Guideline 5.1.1(v). Cascade-deletes the user's first-party
//     data and then removes the Firebase Auth user.
//
//     Order (idempotent — a retry resumes from whatever survived):
//       1. users/{uid}/private/*  (push, location, ...)
//       2. swipes where fromUser == uid
//       3. swipes where toUser   == uid
//       4. matches where userA   == uid  (+ messages subcollection)
//          matches where userB   == uid  (+ messages subcollection)
//       5. reports where reporterId == uid
//       6. users/{uid}
//       7. admin.auth().deleteUser(uid)
//
//     Storage-byte sweep (orphan cleanup) runs AFTER the cascade as a
//     best-effort step:
//       8. Cloudinary `image/destroy` on each `users/{uid}.photos[]` URL
//          (parsed to public_id; needs cloudinary.* functions config).
//       9. Firebase Storage `bucket.deleteFiles({prefix: chats/{matchId}/})`
//          for every match the user was in (collected pre-cascade).
//     Both are wrapped in Promise.allSettled — failures are logged but
//     do not throw, because the Firestore cascade has already met the
//     GDPR Art. 17 posture (no remaining pointer-data; data subject
//     cannot access bytes after auth delete). Physical byte removal
//     just closes the orphan-data residual.
//
//     Still out of scope (deferred):
//       - Legacy pre-2026-05-17 Cloudinary chat-image URLs (would
//         require iterating message subcollections pre-delete to
//         collect URLs). Bytes outlive the cascade; scheduled sweep
//         is the right shape.
//
//     The cascade is hard-bounded by the callable 60 s budget; a
//     pathological user with >> 1k swipes/matches may time out and
//     need the retry path. Logged with explicit stage so an operator
//     can see where the cut happened.
// ============================================================

const BATCH_LIMIT = 500;

// Delete every doc returned by a query, in 500-doc batches. Loops until
// the query returns empty (handles >batch-size collections without
// blowing the Firestore batch cap). Safe to re-run on partial deletes.
const deleteQueryBatched = async (
  query: FirebaseFirestore.Query
): Promise<number> => {
  let totalDeleted = 0;
  while (true) {
    const snap = await query.limit(BATCH_LIMIT).get();
    if (snap.empty) return totalDeleted;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
    // Loop continues if the page was full; a partial page means we're done.
    if (snap.size < BATCH_LIMIT) return totalDeleted;
  }
};

// Recursively delete a match doc and its messages subcollection. Done in
// this order: messages first (so the doc is fully scrubbed even if the
// final parent-delete fails); then the parent.
const deleteMatchWithMessages = async (matchRef: FirebaseFirestore.DocumentReference) => {
  const messagesRef = matchRef.collection('messages');
  await deleteQueryBatched(messagesRef);
  await matchRef.delete();
};

// Pull the Cloudinary public_id out of a delivery URL. Cloudinary's
// destroy API needs the public_id (folder + filename minus extension);
// the URLs we store carry a version segment (v123456789) before the
// public_id and may carry a transformations segment before that.
//
// Examples handled:
//   https://res.cloudinary.com/c/image/upload/v123/users/uid/photos/abc.jpg
//   https://res.cloudinary.com/c/image/upload/c_fill,w_500/v123/users/uid/photos/abc.jpg
const parseCloudinaryPublicId = (url: string): string | null => {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return null;
  const after = url.split('/upload/')[1];
  if (!after) return null;
  const segments = after.split('/');
  // The version segment marks the start of the public_id path. If there's
  // no version (some older Cloudinary URLs), assume no transformation and
  // the public_id begins at the first segment.
  const versionIdx = segments.findIndex((s) => /^v\d+$/.test(s));
  const pathParts = versionIdx >= 0 ? segments.slice(versionIdx + 1) : segments;
  if (pathParts.length === 0) return null;
  const last = pathParts[pathParts.length - 1].replace(/\.[^.]+$/, '');
  return [...pathParts.slice(0, -1), last].join('/');
};

// Best-effort Cloudinary destroy of every URL in the list. Returns when
// every request has settled; per-URL failures only surface in logs.
const purgeCloudinaryUrls = async (urls: string[]): Promise<void> => {
  if (urls.length === 0) return;
  const cloudName = functions.config().cloudinary?.cloud_name;
  const apiKey = functions.config().cloudinary?.api_key;
  const apiSecret = functions.config().cloudinary?.api_secret;
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('Cloudinary config missing — skipping byte cleanup for', urls.length, 'urls');
    return;
  }

  await Promise.allSettled(urls.map(async (url) => {
    const publicId = parseCloudinaryPublicId(url);
    if (!publicId) {
      console.warn('Could not parse public_id from', url);
      return;
    }
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinarySig({ public_id: publicId, timestamp }, apiSecret);
    const body = new URLSearchParams({
      public_id: publicId,
      api_key: apiKey,
      timestamp: String(timestamp),
      signature,
    });
    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        }
      );
      const data = (await res.json()) as { result?: string };
      // "not found" is fine — already deleted or never existed.
      if (data.result !== 'ok' && data.result !== 'not found') {
        console.warn('Cloudinary destroy unexpected result', publicId, data);
      }
    } catch (e) {
      console.error('Cloudinary destroy failed for', publicId, e);
    }
  }));
};

// Best-effort prefix delete on the default Storage bucket for every
// match the user was a participant in. Each prefix maps to ALL chat
// images for that match (both sides); no concept of "my images only".
const purgeStorageChats = async (matchIds: string[]): Promise<void> => {
  if (matchIds.length === 0) return;
  const bucket = admin.storage().bucket();
  await Promise.allSettled(matchIds.map(async (matchId) => {
    try {
      await bucket.deleteFiles({ prefix: `chats/${matchId}/` });
    } catch (e) {
      console.error('Storage prefix delete failed for chats/' + matchId + '/', e);
    }
  }));
};

export const deleteMyAccount = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;

  // Stage tracking — surfaced in logs so an operator can resume manually
  // if a long-tail user hits the callable timeout.
  let stage = 'snapshot';

  // Pre-cascade blob ref snapshot. Photo URLs read off the user doc
  // before deletion; match IDs accumulated as we iterate. The post-
  // cascade purge step uses both to issue bucket destroys.
  let photoUrls: string[] = [];
  const matchIds: string[] = [];

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const photosField = userDoc.data()?.photos;
      if (Array.isArray(photosField)) {
        photoUrls = photosField.filter((u) => typeof u === 'string');
      }
    }

    // 1. private subcollection
    stage = 'private';
    const privateRef = db.collection('users').doc(uid).collection('private');
    await deleteQueryBatched(privateRef);

    // 2. swipes I sent
    stage = 'swipes-from';
    await deleteQueryBatched(db.collection('swipes').where('fromUser', '==', uid));

    // 3. swipes sent to me
    stage = 'swipes-to';
    await deleteQueryBatched(db.collection('swipes').where('toUser', '==', uid));

    // 4. matches (both sides) + nested messages
    stage = 'matches-a';
    const matchesA = await db.collection('matches').where('userA', '==', uid).get();
    for (const m of matchesA.docs) {
      matchIds.push(m.id);
      await deleteMatchWithMessages(m.ref);
    }
    stage = 'matches-b';
    const matchesB = await db.collection('matches').where('userB', '==', uid).get();
    for (const m of matchesB.docs) {
      matchIds.push(m.id);
      await deleteMatchWithMessages(m.ref);
    }

    // 5. reports I filed
    stage = 'reports';
    await deleteQueryBatched(db.collection('reports').where('reporterId', '==', uid));

    // 6. user doc
    stage = 'user-doc';
    await db.collection('users').doc(uid).delete();

    // Audit row written before auth-user delete so we still have a live
    // actor identity for the write. Captures bytes-pending state — the
    // post-cascade purge runs after and is best-effort.
    await writeAuditLog('account_deleted', uid, 'success', {
      photoCount: photoUrls.length,
      matchCount: matchIds.length,
    });

    // 7. Firebase Auth user — last (after audit) so a retry can resume
    // after a Firestore failure. Once the auth user is gone the caller
    // can no longer auth and a fresh signup would create a new uid.
    stage = 'auth-user';
    await admin.auth().deleteUser(uid);

    // 8-9. Best-effort byte cleanup. Failures here do NOT throw — by this
    // point GDPR Art. 17 posture is met (no remaining pointer data) and
    // the data subject has lost access anyway. Logged orphans can be
    // reaped by a scheduled sweep.
    stage = 'blob-cleanup';
    await Promise.allSettled([
      purgeCloudinaryUrls(photoUrls),
      purgeStorageChats(matchIds),
    ]);

    return { ok: true };
  } catch (error: any) {
    console.error(`deleteMyAccount failed at stage="${stage}" uid=${uid}:`, error);
    await writeAuditLog('account_deleted', uid, 'failure', { stage }, error?.message);
    throw new functions.https.HttpsError(
      'internal',
      `Account deletion incomplete at stage "${stage}". Please try again.`
    );
  }
});

// ============================================================
// 12. EXPORT MY ACCOUNT — HTTPS callable. GDPR Art. 15 right of
//     access. Assembles the caller's first-party Firestore data and
//     returns it inline as JSON so the client can present via the OS
//     share sheet.
//
//     Scope (per Art. 15 — the data subject's personal data):
//       - users/{uid} doc
//       - users/{uid}/private/*
//       - swipes where fromUser==uid OR toUser==uid (both directions —
//         received swipes are still personal data about the user)
//       - matches where userA==uid OR userB==uid + each match's
//         messages subcollection (both senders' messages — the other
//         party's messages directed at me are still my personal data)
//       - reports where reporterId==uid
//
//     Other people's UIDs surface in fromUser/toUser/senderId fields —
//     kept as opaque UIDs (no profile-doc dereferencing) so the
//     export doesn't bundle third-party PII the data subject isn't
//     entitled to under Art. 15.
//
//     Payload bound: Callables cap response at ~10 MB. A pathological
//     user with thousands of messages may exceed; logged + thrown
//     explicitly so the caller can be retried via a Storage-signed-URL
//     export shape (follow-up task).
// ============================================================

// Firestore Timestamps don't JSON-serialize cleanly via JSON.stringify
// (`{_seconds, _nanoseconds}` is implementation-leaky). Convert any
// Timestamp-shaped fields to ISO 8601 strings recursively before return.
const serializeValue = (v: any): any => {
  if (v == null) return v;
  if (v instanceof admin.firestore.Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeValue(val);
    return out;
  }
  return v;
};

const serializeSnapshot = (
  snap: FirebaseFirestore.QuerySnapshot
): Array<{ id: string; data: any }> =>
  snap.docs.map((d) => ({ id: d.id, data: serializeValue(d.data()) }));

export const exportMyAccount = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;

  try {
    const userRef = db.collection('users').doc(uid);

    const [
      userDoc,
      privateSnap,
      swipesFromSnap,
      swipesToSnap,
      matchesASnap,
      matchesBSnap,
      reportsSnap,
    ] = await Promise.all([
      userRef.get(),
      userRef.collection('private').get(),
      db.collection('swipes').where('fromUser', '==', uid).get(),
      db.collection('swipes').where('toUser', '==', uid).get(),
      db.collection('matches').where('userA', '==', uid).get(),
      db.collection('matches').where('userB', '==', uid).get(),
      db.collection('reports').where('reporterId', '==', uid).get(),
    ]);

    // Pull each match's messages in parallel — Promise.all on both sides.
    const allMatchDocs = [...matchesASnap.docs, ...matchesBSnap.docs];
    const matchesWithMessages = await Promise.all(
      allMatchDocs.map(async (m) => {
        const messagesSnap = await m.ref.collection('messages').get();
        return {
          id: m.id,
          data: serializeValue(m.data()),
          messages: serializeSnapshot(messagesSnap),
        };
      })
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      userId: uid,
      schemaVersion: 1,
      user: userDoc.exists ? serializeValue(userDoc.data()) : null,
      private: serializeSnapshot(privateSnap),
      swipesSent: serializeSnapshot(swipesFromSnap),
      swipesReceived: serializeSnapshot(swipesToSnap),
      matches: matchesWithMessages,
      reportsFiled: serializeSnapshot(reportsSnap),
    };

    // Soft size guard. Callable hard cap is ~10 MB. Over the inline
    // limit we write the payload to Storage and return a signed URL
    // with 1-hour TTL — the user clicks through (Linking.openURL) and
    // saves the file. Bytes live under `exports/{uid}/{ts}.json` and
    // should be reaped by a project-console lifecycle rule (out of
    // source-code scope; flagged for ops).
    const payloadJson = JSON.stringify(payload);
    // UTF-8 byte length, NOT String#length (UTF-16 code units). Emoji /
    // non-Latin chat text is multi-byte, so `.length` under-counts the
    // real payload size — a heavy export could slip under the 8 MB inline
    // threshold yet exceed the ~10 MB callable response cap and be rejected
    // by the platform. Buffer.byteLength gives the true wire size.
    const approxBytes = Buffer.byteLength(payloadJson, 'utf8');

    if (approxBytes > 8 * 1024 * 1024) {
      const path = `exports/${uid}/${Date.now()}.json`;
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(path);
        await file.save(payloadJson, {
          contentType: 'application/json',
          resumable: false,
        });
        const expiresMs = Date.now() + 60 * 60 * 1000; // 1 hour
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: expiresMs,
        });
        await writeAuditLog('account_exported', uid, 'success', {
          approxBytes,
          delivery: 'signed_url',
          matchCount: matchesWithMessages.length,
          swipesSent: swipesFromSnap.size,
          swipesReceived: swipesToSnap.size,
        });
        return {
          inline: false,
          url,
          expiresAt: new Date(expiresMs).toISOString(),
        };
      } catch (err: any) {
        console.error(`exportMyAccount signed-url path failed uid=${uid}:`, err);
        await writeAuditLog('account_exported', uid, 'failure',
          { reason: 'storage_write_failed', approxBytes }, err?.message);
        throw new functions.https.HttpsError(
          'internal',
          'Data export failed at the file-delivery step. Please try again.'
        );
      }
    }

    await writeAuditLog('account_exported', uid, 'success', {
      approxBytes,
      delivery: 'inline',
      matchCount: matchesWithMessages.length,
      swipesSent: swipesFromSnap.size,
      swipesReceived: swipesToSnap.size,
    });

    return { inline: true, data: payload };
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error(`exportMyAccount failed uid=${uid}:`, error);
    await writeAuditLog('account_exported', uid, 'failure', {}, error?.message);
    throw new functions.https.HttpsError(
      'internal',
      'Data export failed. Please try again.'
    );
  }
});

// ============================================================
// 13. SWEEP LEGACY CLOUDINARY CHAT IMAGES — scheduled.
//
//     Pre-2026-05-17 chat-image uploads went to Cloudinary
//     (`res.cloudinary.com/.../chats/...`). Post-fix they go to
//     Firebase Storage (see services/storage.ts:uploadChatImage and
//     06_Reports/security_chat_images_firebase_storage_2026-05-17).
//
//     Legacy Cloudinary bytes outlive their match's normal expiry
//     (autoExpireMatches only flips isActive — it doesn't delete
//     messages). Participants can no longer reach them in the UI
//     (the message subcollection is participant-gated and the match
//     is expired), but the bytes remain in the Cloudinary bucket
//     indefinitely. GDPR Art. 5(1)(e) "storage limitation" wants
//     them gone.
//
//     This sweep:
//       1. Pulls up to 200 expired matches (isActive=false).
//       2. Filters in-memory for those NOT marked
//          `cloudinaryChatSweepAt` — once a match is processed it
//          gets the marker and won't be re-read meaningfully.
//       3. For each, reads the messages subcollection (cap 100),
//          filters for Cloudinary chat URLs, destroys them via the
//          existing purgeCloudinaryUrls helper (which already signs
//          and handles "not found" idempotently).
//       4. Marks the match with `cloudinaryChatSweepAt =
//          serverTimestamp()` so future runs skip.
//
//     Read cost converges once all legacy matches are marked:
//     ~200 reads/day to find candidates, near-zero processing.
//     Matches rule already denies client updates to fields other
//     than `typing_<uid>`, so this marker can't be cleared from
//     the client.
// ============================================================

const CHAT_SWEEP_MATCH_CAP = 200;
const CHAT_SWEEP_MSGS_PER_MATCH = 100;

export const sweepLegacyCloudinaryChatImages = functions.pubsub
  .schedule('every day 03:00')
  .timeZone('UTC')
  .onRun(async () => {
    const matchesSnap = await db
      .collection('matches')
      .where('isActive', '==', false)
      .limit(CHAT_SWEEP_MATCH_CAP)
      .get();

    if (matchesSnap.empty) {
      console.log('Cloudinary chat sweep: no expired matches');
      return null;
    }

    const unswept = matchesSnap.docs.filter((d) => !d.data().cloudinaryChatSweepAt);
    if (unswept.length === 0) {
      console.log('Cloudinary chat sweep: all matches in window already marked');
      return null;
    }

    let totalDestroyAttempts = 0;
    for (const matchDoc of unswept) {
      try {
        const messagesSnap = await matchDoc.ref
          .collection('messages')
          .limit(CHAT_SWEEP_MSGS_PER_MATCH)
          .get();
        const cloudinaryUrls = messagesSnap.docs
          .map((d) => d.data().imageUrl)
          .filter(
            (u): u is string =>
              typeof u === 'string' &&
              u.includes('res.cloudinary.com') &&
              u.includes('/chats/')
          );
        if (cloudinaryUrls.length > 0) {
          await purgeCloudinaryUrls(cloudinaryUrls);
          totalDestroyAttempts += cloudinaryUrls.length;
        }
        await matchDoc.ref.update({
          cloudinaryChatSweepAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('chat sweep error for match', matchDoc.id, e);
      }
    }

    console.log(
      `Cloudinary chat sweep: ${totalDestroyAttempts} destroys attempted across ${unswept.length} matches`
    );
    return null;
  });

// ============================================================
// 14. SWEEP LEGACY USER FIELDS — scheduled.
//
//     Clears the now-stale fields that this session moved from
//     `users/{uid}` to `users/{uid}/private/*`:
//       - `pushToken`                 → private/push.token
//       - `swipedUserIds`             → private/state.swipedUserIds
//       - `swipesUsedToday`           → private/state.swipesUsedToday
//       - `boostsUsedToday`           → private/state.boostsUsedToday
//       - `superLikesUsedToday`       → private/state.superLikesUsedToday
//       - `lastSwipeReset`            → private/state.lastSwipeReset
//
//     Active users self-migrate on their next swipe / push register
//     (swipeAction does merged read; notifications.ts writes private
//     then clears legacy). Inactive users never trigger that — their
//     stale data sits on a publicly-readable doc indefinitely. This
//     sweep handles them deterministically.
//
//     Per-user transaction: copies legacy → private only if private
//     doesn't already exist (avoids clobbering active users' newer
//     data); always clears the top-level legacy fields. Idempotent.
//
//     Cursor stored in `sweep_state/legacy_user_fields.cursor`
//     (createdAt timestamp). Paginates 200/run; converges to a
//     no-op once all users are processed.
// ============================================================

const LEGACY_USER_SWEEP_CAP = 200;
const LEGACY_FIELD_KEYS = [
  'pushToken',
  'swipedUserIds',
  'swipesUsedToday',
  'boostsUsedToday',
  'superLikesUsedToday',
  'lastSwipeReset',
] as const;

export const sweepLegacyUserFields = functions.pubsub
  .schedule('every day 04:00')
  .timeZone('UTC')
  .onRun(async () => {
    const stateRef = db.collection('sweep_state').doc('legacy_user_fields');
    const stateSnap = await stateRef.get();
    const cursor = stateSnap.data()?.cursor as FirebaseFirestore.Timestamp | undefined;

    let query = db.collection('users').orderBy('createdAt').limit(LEGACY_USER_SWEEP_CAP);
    if (cursor) {
      query = query.startAfter(cursor);
    }
    const snap = await query.get();

    if (snap.empty) {
      console.log('Legacy user fields sweep: caught up — no users past cursor');
      return null;
    }

    let cleaned = 0;
    let migrated = 0;
    let lastCreatedAt: FirebaseFirestore.Timestamp | null = null;

    for (const userSnap of snap.docs) {
      const userRef = userSnap.ref;
      const data = userSnap.data();
      lastCreatedAt = data.createdAt ?? lastCreatedAt;

      // Skip if no legacy fields present (new user post-migration).
      const hasLegacy = LEGACY_FIELD_KEYS.some((k) => data[k] !== undefined);
      if (!hasLegacy) continue;

      try {
        await db.runTransaction(async (tx) => {
          const u = (await tx.get(userRef)).data() as any;
          if (!u) return;

          // Re-check inside the transaction in case the user just self-
          // migrated between the outer paged read and now.
          const stillHasLegacy = LEGACY_FIELD_KEYS.some((k) => u[k] !== undefined);
          if (!stillHasLegacy) return;

          // pushToken → private/push (only if private/push has no token).
          if (typeof u.pushToken === 'string' && u.pushToken.length > 0) {
            const privatePushRef = userRef.collection('private').doc('push');
            const privatePushSnap = await tx.get(privatePushRef);
            const existingToken = privatePushSnap.data()?.token;
            if (!existingToken) {
              tx.set(
                privatePushRef,
                { token: u.pushToken, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
                { merge: true }
              );
            }
          }

          // Counters + swipedUserIds → private/state (only if doc absent).
          const stateRefInner = userRef.collection('private').doc('state');
          const stateSnapInner = await tx.get(stateRefInner);
          if (!stateSnapInner.exists) {
            const payload: Record<string, any> = {};
            if (Array.isArray(u.swipedUserIds)) payload.swipedUserIds = u.swipedUserIds;
            if (typeof u.swipesUsedToday === 'number') payload.swipesUsedToday = u.swipesUsedToday;
            if (typeof u.boostsUsedToday === 'number') payload.boostsUsedToday = u.boostsUsedToday;
            if (typeof u.superLikesUsedToday === 'number') payload.superLikesUsedToday = u.superLikesUsedToday;
            if (u.lastSwipeReset) payload.lastSwipeReset = u.lastSwipeReset;
            if (Object.keys(payload).length > 0) {
              tx.set(stateRefInner, payload, { merge: true });
              migrated++;
            }
          }

          // Always clear the legacy top-level fields.
          tx.update(userRef, {
            pushToken: admin.firestore.FieldValue.delete(),
            swipedUserIds: admin.firestore.FieldValue.delete(),
            swipesUsedToday: admin.firestore.FieldValue.delete(),
            boostsUsedToday: admin.firestore.FieldValue.delete(),
            superLikesUsedToday: admin.firestore.FieldValue.delete(),
            lastSwipeReset: admin.firestore.FieldValue.delete(),
          });
          cleaned++;
        });
      } catch (e) {
        console.error('Legacy user field sweep error for user', userSnap.id, e);
      }
    }

    // Advance cursor to last processed createdAt so the next run picks
    // up where this one stopped. Even if `snap.size < cap`, store the
    // cursor — the next run will return empty if no new users were
    // created with createdAt > cursor.
    if (lastCreatedAt) {
      await stateRef.set(
        { cursor: lastCreatedAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    console.log(
      `Legacy user fields sweep: scanned ${snap.size}, cleaned ${cleaned}, ` +
        `migrated ${migrated} private/state docs`
    );
    return null;
  });

// ============================================================
// SUPPORTING — DELETE PHOTO (callable).
//   Single-photo cleanup for the profile-edit path. Pre-fix
//   `services/storage.ts:deletePhoto` was a stub that returned true
//   without doing anything → removing a photo in profile-edit
//   orphaned the Cloudinary bytes indefinitely (account-deletion
//   sweep only catches them at full account delete).
//
//   Namespace check is the security gate: the parsed public_id must
//   begin with `users/{callerUid}/photos/` so the caller can only
//   destroy their own photos. parseCloudinaryPublicId is the same
//   helper used by the account-deletion path.
// ============================================================
export const deletePhotoCallable = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const url = data?.url;
  if (typeof url !== 'string' || url.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'url is required.');
  }
  const publicId = parseCloudinaryPublicId(url);
  if (!publicId) {
    throw new functions.https.HttpsError('invalid-argument', 'not a Cloudinary URL.');
  }
  // Namespace gate: the public_id must live under the caller's own
  // photos folder. Without this, a caller could destroy any user's
  // photos by passing their URL.
  const expectedPrefix = `users/${context.auth.uid}/photos/`;
  if (!publicId.startsWith(expectedPrefix)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'photo does not belong to caller.'
    );
  }
  await purgeCloudinaryUrls([url]);
  return { ok: true };
});

// ============================================================
// 15. STRIP EXIF ON CHAT-IMAGE UPLOAD — Storage trigger.
//
//     Closes audit S2-1 for the Firebase Storage chat-image path
//     (profile photos go through Cloudinary's signed-upload, which
//     now sets `fl_strip_profile` at ingest — see signUpload above).
//
//     RN clients don't strip EXIF locally; the file lands in
//     `chats/{matchId}/{filename}` with camera GPS, device serial,
//     and capture timestamp intact. Chat partners + anyone who
//     gets the URL could read those. This trigger fires on every
//     finalize, reads the bytes, runs sharp().withMetadata({}) to
//     drop EXIF/IPTC/XMP/ICC, and overwrites the file in place.
//
//     `sharp` is a server-only dep (native bindings); only the
//     functions package carries it.
//
//     Sub-second-window residual: between upload-finalize and this
//     trigger completing, the unstripped file is technically
//     readable via the signed URL the uploader holds. The Storage
//     rule still gates by match participation, so only the chat
//     counterparty could read it in that window. Acceptable trade-
//     off vs. a client-pre-strip + upload-CF flow (which would
//     double-store bytes).
// ============================================================

// Lazy require because sharp's native bindings load eagerly at
// import; deferring until the trigger first fires keeps the deploy-
// time bundle parse fast.
let sharpModule: typeof import('sharp') | null = null;
const getSharp = () => {
  if (!sharpModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sharpModule = require('sharp');
  }
  return sharpModule!;
};

export const stripExifOnChatImageUpload = functions.storage
  .object()
  .onFinalize(async (object) => {
    const name = object.name;
    const contentType = object.contentType ?? '';

    // Only chat-image uploads. Other paths (exports/, cache) skipped.
    if (!name || !name.startsWith('chats/')) return;
    if (!contentType.startsWith('image/')) return;

    // Avoid recursion: this trigger overwrites the file via the
    // admin SDK, which fires onFinalize again. The metadata flag
    // below marks already-processed files so the second run no-ops.
    const meta = object.metadata ?? {};
    if (meta.exifStripped === 'true') return;

    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(name);

    try {
      const [buf] = await file.download();
      const sharp = getSharp();
      // sharp strips ALL metadata (EXIF + IPTC + XMP + ICC) by default —
      // metadata is only carried through to the output if you explicitly
      // call .withMetadata()/.keepMetadata(). So the strip is achieved by
      // NOT calling withMetadata (the prior `.withMetadata({})` here did
      // the opposite — it RETAINED EXIF, leaking camera GPS/device data).
      // .rotate() with no args auto-orients from the EXIF orientation tag
      // and bakes it into the pixels, so the image still displays the
      // right way up once the (now-stripped) orientation tag is gone.
      const stripped = await sharp(buf).rotate().toBuffer();

      await file.save(stripped, {
        contentType,
        resumable: false,
        metadata: {
          // Custom metadata field marks the file as processed so
          // the re-fire of onFinalize from the save() above
          // short-circuits.
          metadata: { ...meta, exifStripped: 'true' },
        },
      });

      console.log(`Stripped EXIF: ${name}`);
    } catch (e) {
      console.error(`stripExifOnChatImageUpload failed for ${name}:`, e);
    }
  });

// ============================================================
// 16. RE-STRIP LEGACY CHAT-IMAGE EXIF — scheduled (one-shot remediation).
//
//     stripExifOnChatImageUpload shipped with its strip INVERTED
//     (`.withMetadata({})` retains metadata in sharp; default strips) —
//     see 06_Reports/security_exif_strip_inverted_fix_2026-05-24. Every
//     chat image uploaded before that fix kept its camera GPS / device
//     EXIF AND was stamped `exifStripped:'true'`, so neither the trigger
//     nor its flag will ever revisit them. This sweep scrubs them.
//
//     Self-limiting: it re-strips only files that STILL carry
//     EXIF/IPTC/XMP (post-fix uploads are already clean and are skipped
//     after a cheap metadata read). Paginates `chats/` via a stored
//     pageToken cursor (sweep_state/chat_exif_resweep); sets `done:true`
//     once the prefix is exhausted so it stops scanning forever after.
//
//     Idempotent: a run that times out mid-page doesn't advance the
//     cursor, so the next run re-reads the page — already-clean files are
//     skipped, so it still makes progress. Re-saving a file fires
//     stripExifOnChatImageUpload again, but the `exifStripped:'true'`
//     marker we re-set short-circuits it (no loop).
// ============================================================

const CHAT_EXIF_RESWEEP_CAP = 100;

export const reStripLegacyChatImageExif = functions
  .runWith({ memory: '512MB', timeoutSeconds: 300 })
  .pubsub.schedule('every day 05:00')
  .timeZone('UTC')
  .onRun(async () => {
    const stateRef = db.collection('sweep_state').doc('chat_exif_resweep');
    const stateSnap = await stateRef.get();
    if (stateSnap.data()?.done === true) {
      console.log('chat EXIF resweep: complete — nothing to do');
      return null;
    }
    const pageToken = stateSnap.data()?.pageToken as string | undefined;

    const bucket = admin.storage().bucket();
    const result = await bucket.getFiles({
      prefix: 'chats/',
      maxResults: CHAT_EXIF_RESWEEP_CAP,
      autoPaginate: false,
      ...(pageToken ? { pageToken } : {}),
    });
    const files = result[0];
    const nextQuery = result[1] as { pageToken?: string } | null | undefined;

    const sharp = getSharp();
    let scanned = 0;
    let restripped = 0;

    for (const file of files) {
      const meta = file.metadata as any;
      const contentType: string = meta?.contentType ?? '';
      if (!contentType.startsWith('image/')) continue;
      scanned++;
      try {
        const [buf] = await file.download();
        const sm = await sharp(buf).metadata();
        // Only re-process files that still carry PII-bearing metadata.
        // (GPS/device data lives in EXIF; IPTC/XMP can carry caption/author.)
        if (!sm.exif && !sm.iptc && !sm.xmp) continue;

        const stripped = await sharp(buf).rotate().toBuffer();
        await file.save(stripped, {
          contentType,
          resumable: false,
          metadata: {
            metadata: { ...(meta?.metadata ?? {}), exifStripped: 'true' },
          },
        });
        restripped++;
      } catch (e) {
        console.error('chat EXIF resweep error for', file.name, e);
      }
    }

    const nextToken = nextQuery?.pageToken;
    if (nextToken) {
      await stateRef.set(
        { pageToken: nextToken, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    } else {
      await stateRef.set(
        {
          done: true,
          pageToken: admin.firestore.FieldValue.delete(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    console.log(
      `chat EXIF resweep: scanned ${scanned} images, re-stripped ${restripped}, ` +
        `more=${!!nextToken}`
    );
    return null;
  });

// ============================================================
// 17. DISCOVERY INDEX (Phase 1 of the server-side feed) —
//     06_Reports/design_server_side_feed_2026-05-24.
//
//   `discovery/{uid}` is a denormalized, admin-SDK-only index doc per
//   user holding the attributes the (Phase 2) feed callable queries:
//     - geohash + lat/lng  (from users/{uid}/private/location)
//     - gender, age, tierLevel, discoverable  (from users/{uid})
//   It is rule-denied to clients (default-deny in firestore.rules): it
//   carries precise coords, which must never be client-readable. Kept off
//   the broadly-readable user doc on purpose.
//
//   Maintained by two onWrite triggers (keep the doc fresh as the user /
//   their location change) + a one-shot paginated backfill for existing
//   users. New users self-populate via the triggers firing on create.
// ============================================================

// Standard base-32 geohash encoder — same algorithm + alphabet + precision
// (10) as geofire-common, so a Phase-2 feed query can compute query bounds
// over these values with geofire-common (or inlined equivalents). Encoding
// only; bounds + haversine refine arrive with the feed CF in Phase 2.
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const GEOHASH_PRECISION = 10;

const geohashForLocation = (lat: number, lng: number): string => {
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return '';
  }
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (hash.length < GEOHASH_PRECISION) {
    if (evenBit) {
      const lngMid = (lngMin + lngMax) / 2;
      if (lng >= lngMid) { idx = idx * 2 + 1; lngMin = lngMid; }
      else { idx = idx * 2; lngMax = lngMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) { idx = idx * 2 + 1; latMin = latMid; }
      else { idx = idx * 2; latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += GEOHASH_BASE32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return hash;
};

// The slice of a user doc that the discovery index mirrors. `discoverable`
// is the single gate the feed query filters on (verified both ways +
// profile complete).
interface UserDiscoveryProjection {
  gender: string;
  age: number;
  tierLevel: string;
  discoverable: boolean;
}

const userDiscoveryProjection = (
  u: FirebaseFirestore.DocumentData
): UserDiscoveryProjection => ({
  gender: typeof u.gender === 'string' ? u.gender : '',
  age: typeof u.age === 'number' ? u.age : 0,
  tierLevel: typeof u.tierLevel === 'string' ? u.tierLevel : 'FREE',
  discoverable:
    u.verifiedSelfie === true && u.verifiedID === true && u.isProfileComplete === true,
});

// Mirror the user-doc projection into discovery/{uid}. Deletion of the
// user doc (incl. via deleteMyAccount) removes the index doc too.
export const syncDiscoveryFromUser = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const discoveryRef = db.collection('discovery').doc(uid);

    if (!change.after.exists) {
      await discoveryRef
        .delete()
        .catch((e) => console.error('discovery delete failed for', uid, e));
      return null;
    }

    const next = userDiscoveryProjection(change.after.data()!);

    // Skip the write unless a projected field actually changed — the user
    // doc is written often (profile edits, tier sync, verification flips),
    // and only these fields affect the index. Avoids write amplification.
    if (change.before.exists) {
      const prev = userDiscoveryProjection(change.before.data()!);
      if (
        prev.gender === next.gender &&
        prev.age === next.age &&
        prev.tierLevel === next.tierLevel &&
        prev.discoverable === next.discoverable
      ) {
        return null;
      }
    }

    await discoveryRef.set(
      { ...next, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    return null;
  });

// Recompute geohash + lat/lng whenever the owner-only precise-location doc
// changes. Cleared geo fields when the location doc is deleted.
export const syncDiscoveryFromLocation = functions.firestore
  .document('users/{uid}/private/location')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const discoveryRef = db.collection('discovery').doc(uid);

    if (!change.after.exists) {
      await discoveryRef
        .set(
          {
            geohash: admin.firestore.FieldValue.delete(),
            lat: admin.firestore.FieldValue.delete(),
            lng: admin.firestore.FieldValue.delete(),
          },
          { merge: true }
        )
        .catch((e) => console.error('discovery geo-clear failed for', uid, e));
      return null;
    }

    const loc = change.after.data()!;
    const geohash = geohashForLocation(loc.latitude, loc.longitude);
    if (!geohash) {
      console.warn('discovery: invalid coords for', uid, loc.latitude, loc.longitude);
      return null;
    }

    await discoveryRef.set(
      {
        geohash,
        lat: loc.latitude,
        lng: loc.longitude,
        locationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return null;
  });

// One-shot paginated backfill for users that pre-date the triggers.
// Converges then marks `done` (new users self-populate via the triggers).
const DISCOVERY_BACKFILL_CAP = 200;

export const backfillDiscoveryIndex = functions
  .runWith({ timeoutSeconds: 300 })
  .pubsub.schedule('every day 02:00')
  .timeZone('UTC')
  .onRun(async () => {
    const stateRef = db.collection('sweep_state').doc('discovery_backfill');
    const stateSnap = await stateRef.get();
    if (stateSnap.data()?.done === true) {
      console.log('discovery backfill: complete — nothing to do');
      return null;
    }
    const cursor = stateSnap.data()?.cursor as FirebaseFirestore.Timestamp | undefined;

    let query = db.collection('users').orderBy('createdAt').limit(DISCOVERY_BACKFILL_CAP);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();

    if (snap.empty) {
      await stateRef.set(
        { done: true, completedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      console.log('discovery backfill: caught up — marked done');
      return null;
    }

    let written = 0;
    let lastCreatedAt: FirebaseFirestore.Timestamp | null = null;

    for (const userSnap of snap.docs) {
      const uid = userSnap.id;
      const u = userSnap.data();
      lastCreatedAt = u.createdAt ?? lastCreatedAt;
      try {
        const payload: Record<string, any> = {
          ...userDiscoveryProjection(u),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        const locSnap = await db
          .collection('users').doc(uid)
          .collection('private').doc('location')
          .get();
        const loc = locSnap.data();
        if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
          const gh = geohashForLocation(loc.latitude, loc.longitude);
          if (gh) {
            payload.geohash = gh;
            payload.lat = loc.latitude;
            payload.lng = loc.longitude;
          }
        }
        await db.collection('discovery').doc(uid).set(payload, { merge: true });
        written++;
      } catch (e) {
        console.error('discovery backfill error for', uid, e);
      }
    }

    if (lastCreatedAt) {
      await stateRef.set(
        { cursor: lastCreatedAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    console.log(`discovery backfill: wrote ${written}/${snap.size}`);
    return null;
  });

// ============================================================
// 18. GET DISCOVERY FEED (Phase 2) — HTTPS callable. Ranked,
//     distance-aware discovery feed. Replaces the client-side
//     getNearbyProfiles query. 06_Reports/design_server_side_feed_2026-05-24.
//
//   - Viewer's center is read from users/{uid}/private/location DIRECTLY
//     (admin SDK) — not the viewer's own discovery doc — so a user who
//     just enabled location gets an immediate feed without waiting for the
//     sync trigger. needsLocation:true signals the client to prompt.
//   - Candidates come from the discovery index via geohash-bounds queries
//     (geofire-common), refined by exact haversine distance, then filtered
//     by the viewer's gender/age prefs and swiped set (SERVER-SIDE swiped
//     exclusion — fixes the heavy-swiper client re-scan), ranked nearest
//     first, and paged by an opaque (distance,uid) cursor.
//   - Returns only PUBLIC profile fields + a BUCKETED distance label
//     (never raw coords / precise distance — trilateration defense).
//
//   v1 limits (Phase 3 hardening): per-bound cap truncates very dense
//   areas; each page re-gathers + re-ranks the radius pool (bounded reads).
// ============================================================

const FEED_DEFAULT_LIMIT = 20;
const FEED_MAX_LIMIT = 50;
const FEED_PER_BOUND_CAP = 50;
const FEED_DEFAULT_MAX_DISTANCE_KM = 100;

const encodeFeedCursor = (distanceKm: number, uid: string): string =>
  Buffer.from(JSON.stringify({ d: distanceKm, u: uid })).toString('base64');

const decodeFeedCursor = (cursor: unknown): { d: number; u: string } | null => {
  if (typeof cursor !== 'string' || cursor.length === 0) return null;
  try {
    const obj = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
    return typeof obj?.d === 'number' && typeof obj?.u === 'string' ? obj : null;
  } catch {
    return null;
  }
};

// Bucketed distance — never the precise value (trilateration defense).
const distanceLabel = (km: number): string => {
  if (km < 1) return '< 1 km';
  if (km < 5) return '1–5 km';
  if (km < 10) return '5–10 km';
  if (km < 25) return '10–25 km';
  if (km < 50) return '25–50 km';
  return '50+ km';
};

// genderPreference is an array of Gender labels ('Man'|'Woman'|'Non-binary'
// |'Other'); empty/absent means "everyone". (Phase 0 adds the UI to set it;
// until then it's absent → everyone.)
const matchesGenderPref = (pref: unknown, candidateGender: unknown): boolean => {
  if (!Array.isArray(pref) || pref.length === 0) return true;
  return pref.includes(candidateGender);
};

export const getDiscoveryFeed = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in.');
  }
  const uid = context.auth.uid;
  const limit = Math.min(
    Math.max(typeof data?.limit === 'number' ? Math.floor(data.limit) : FEED_DEFAULT_LIMIT, 1),
    FEED_MAX_LIMIT
  );
  const cursor = decodeFeedCursor(data?.cursor);

  // Viewer context: own precise coords (source of truth), preferences,
  // swiped set (+ legacy top-level fallback during the migration window).
  const userRef = db.collection('users').doc(uid);
  const [locSnap, prefsSnap, stateSnap, userSnap] = await Promise.all([
    userRef.collection('private').doc('location').get(),
    userRef.collection('private').doc('preferences').get(),
    userRef.collection('private').doc('state').get(),
    userRef.get(),
  ]);

  const loc = locSnap.data();
  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    // No coords → distance feed impossible. Signal the client to prompt
    // for location instead of silently returning an empty deck.
    return { profiles: [], nextCursor: null, needsLocation: true };
  }
  const center: [number, number] = [loc.latitude, loc.longitude];

  const prefs = prefsSnap.data() ?? {};
  const genderPref = prefs.genderPreference;
  const ageMin = typeof prefs.ageMin === 'number' ? prefs.ageMin : 18;
  const ageMax = typeof prefs.ageMax === 'number' ? prefs.ageMax : 100;
  // Clamp to a sane band — preferences are owner-writable, so don't let an
  // arbitrary radius drive a global geo scan.
  const maxDistanceKm = Math.min(
    Math.max(typeof prefs.maxDistanceKm === 'number' ? prefs.maxDistanceKm : FEED_DEFAULT_MAX_DISTANCE_KM, 1),
    500
  );

  const swiped = new Set<string>();
  const stateSwiped = stateSnap.data()?.swipedUserIds;
  if (Array.isArray(stateSwiped)) stateSwiped.forEach((id: string) => swiped.add(id));
  const legacySwiped = userSnap.data()?.swipedUserIds; // migration-window fallback
  if (Array.isArray(legacySwiped)) legacySwiped.forEach((id: string) => swiped.add(id));

  // One range query per geohash bound covering the radius.
  const bounds = geohashQueryBounds(center, maxDistanceKm * 1000);
  const snaps = await Promise.all(
    bounds.map((b) =>
      db
        .collection('discovery')
        .where('discoverable', '==', true)
        .orderBy('geohash')
        .startAt(b[0])
        .endAt(b[1])
        .limit(FEED_PER_BOUND_CAP)
        .get()
    )
  );

  // Merge + filter: dedupe, drop self/swiped, exact-distance (geohash cells
  // over-approximate the circle), gender + age prefs.
  const seen = new Set<string>();
  const candidates: { uid: string; distanceKm: number }[] = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (doc.id === uid || seen.has(doc.id) || swiped.has(doc.id)) continue;
      seen.add(doc.id);
      const d = doc.data();
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') continue;
      const distanceKm = distanceBetween([d.lat, d.lng], center);
      if (distanceKm > maxDistanceKm) continue;
      if (!matchesGenderPref(genderPref, d.gender)) continue;
      if (typeof d.age === 'number' && (d.age < ageMin || d.age > ageMax)) continue;
      candidates.push({ uid: doc.id, distanceKm });
    }
  }

  // Nearest first; uid tiebreak so the (distance,uid) cursor is deterministic.
  candidates.sort(
    (a, b) => a.distanceKm - b.distanceKm || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  );

  // Resume strictly after the last (distance,uid) returned.
  let startIdx = 0;
  if (cursor) {
    startIdx = candidates.findIndex(
      (c) => c.distanceKm > cursor.d || (c.distanceKm === cursor.d && c.uid > cursor.u)
    );
    if (startIdx < 0) startIdx = candidates.length;
  }
  const pageSlice = candidates.slice(startIdx, startIdx + limit);

  // Resolve public profile fields for the page (+ bucketed distance).
  const resolved = await Promise.all(
    pageSlice.map(async (c) => {
      const u = (await db.collection('users').doc(c.uid).get()).data();
      if (!u) return null;
      return {
        id: c.uid,
        name: u.name ?? '',
        age: u.age ?? 0,
        gender: u.gender ?? '',
        bio: u.bio ?? '',
        photos: Array.isArray(u.photos) ? u.photos : [],
        interests: Array.isArray(u.interests) ? u.interests : [],
        location: { city: u.location?.city ?? null },
        verifiedSelfie: u.verifiedSelfie === true,
        verifiedID: u.verifiedID === true,
        tierLevel: u.tierLevel ?? 'FREE',
        distanceLabel: distanceLabel(c.distanceKm),
      };
    })
  );
  const profiles = resolved.filter((p) => p !== null);

  const last = pageSlice[pageSlice.length - 1];
  const hasMore = startIdx + limit < candidates.length;
  const nextCursor = hasMore && last ? encodeFeedCursor(last.distanceKm, last.uid) : null;

  return { profiles, nextCursor };
});
