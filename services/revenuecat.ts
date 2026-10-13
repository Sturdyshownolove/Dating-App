import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';
import functions from '@react-native-firebase/functions';
import { TierLevel } from '@/constants/tiers';

let didLogIn = false;

/**
 * Associate the current RevenueCat session with the Firebase user ID.
 *
 * `Purchases.configure({ apiKey })` happens once in app/_layout.tsx with
 * env-driven keys — that is the only place RC is configured. Here we
 * only log the user in so entitlements + subscriptions are scoped to
 * the right account.
 *
 * Pre-rewrite this called `Purchases.configure` again with placeholder
 * strings from constants/config.ts (`REVENUECAT_CONFIG`). That was a
 * dormant bug: double-configuring RC with broken keys would have
 * silently replaced the working setup the moment premium UI shipped.
 * Both stale exports were deleted in the same pass.
 */
export const initRevenueCat = async (userId: string): Promise<void> => {
  if (didLogIn) return;
  try {
    await Purchases.logIn(userId);
    didLogIn = true;
  } catch (error) {
    console.error('RevenueCat logIn error:', error);
  }
};

/**
 * Resets the RC session to anonymous and clears our `didLogIn` guard
 * so the next `initRevenueCat(newUid)` actually fires. Without this,
 * account-switching on the same device leaves RC still attributed to
 * the previous user → purchases by the new user upgrade the wrong
 * subscriber. Called from `authStore.logout`.
 *
 * `Purchases.logOut()` throws if the session is already anonymous; we
 * swallow that case so logout is safe to call from any state.
 */
export const logOutRevenueCat = async (): Promise<void> => {
  try {
    await Purchases.logOut();
  } catch (error) {
    // Already-anonymous case — RC SDK throws but it's a no-op for us.
    console.warn('RC logOut (likely already anonymous):', error);
  } finally {
    didLogIn = false;
  }
};

export const getOfferings = async () => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages || [];
  } catch (error) {
    console.error('Error fetching offerings:', error);
    return [];
  }
};

/**
 * After RC handles the purchase, hand off tier-of-truth to the server.
 * The `syncTierFromEntitlements` CF queries RC's REST API for the canonical
 * entitlement set and writes `users/{uid}.tierLevel` via admin SDK. The
 * client never claims a tier — it only triggers the re-check.
 */
export const purchasePackage = async (
  pkg: PurchasesPackage,
  userId: string
): Promise<{ success: boolean; tier?: TierLevel; error?: string }> => {
  try {
    await Purchases.purchasePackage(pkg);
    const callable = functions().httpsCallable('syncTierFromEntitlements');
    const result = await callable({});
    const tier = (result.data as { tier?: TierLevel })?.tier;
    return { success: true, tier };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, error: 'Purchase cancelled' };
    }
    return { success: false, error: error.message || 'Purchase failed' };
  }
};

export const restorePurchases = async (userId: string): Promise<TierLevel> => {
  try {
    await Purchases.restorePurchases();
    const callable = functions().httpsCallable('syncTierFromEntitlements');
    const result = await callable({});
    return (result.data as { tier?: TierLevel })?.tier ?? 'FREE';
  } catch (error) {
    console.error('Error restoring purchases:', error);
    return 'FREE';
  }
};

export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('Error getting customer info:', error);
    return null;
  }
};
