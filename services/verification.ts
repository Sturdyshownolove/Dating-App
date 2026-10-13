import functions from '@react-native-firebase/functions';

/**
 * Verify selfie — STUB.
 *
 * Calls the `verifyMe` Cloud Function which writes `verifiedSelfie: true`
 * via admin SDK. No first-party storage write — the captured image stays
 * in device-local cache and is discarded by the OS. Closes the verification
 * half of audit S0-4 (no new PII artifacts land in Cloudinary).
 *
 * The CF body is the same stub that used to live here (always succeeds
 * after ~2s); the architectural change is that the trust-field writer is
 * now admin-side, which unblocks the firestore.rules user-doc field lock.
 *
 * `imageUri` is kept on the signature so the vendor SDK integration
 * (Persona / Onfido) can wire in without a caller change. The vendor SDK
 * uploads directly to vendor storage, not first-party.
 */
export const verifySelfie = async (
  userId: string,
  imageUri: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const callable = functions().httpsCallable('verifyMe');
    await callable({ kind: 'selfie' });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Verification failed' };
  }
};

/**
 * Verify ID document — STUB. See verifySelfie.
 */
export const verifyID = async (
  userId: string,
  imageUri: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const callable = functions().httpsCallable('verifyMe');
    await callable({ kind: 'id' });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'ID verification failed' };
  }
};
