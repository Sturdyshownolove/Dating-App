import * as Crypto from 'expo-crypto';

/**
 * HIBP (Have I Been Pwned) breached-password check via k-anonymity.
 *
 * Privacy model: only the first 5 hex chars of the SHA-1 hash leave
 * the device. The HIBP API returns ALL hash suffixes that begin with
 * those 5 chars (typically ~500 entries), and we match the full hash
 * client-side. HIBP never sees the password or its full hash.
 *
 * Closes S1-6 residual flagged in
 * [[06_Reports/auth_password_policy_2026-05-24]]. Length + complexity
 * already enforced by `utils/validation.ts:validatePassword`; this
 * adds the breach check that NIST 800-63B recommends for any
 * memorized-secret policy.
 *
 * Fail-open: a network error returns `breached: false` with an
 * `error` field set, so a transient HIBP outage doesn't block
 * registration entirely. The other validations (length + complexity)
 * still gate at the rule layer.
 */
export const checkPasswordBreached = async (
  password: string
): Promise<{ breached: boolean; count: number; error?: string }> => {
  try {
    const sha1 = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      password
    );
    const upper = sha1.toUpperCase();
    const prefix = upper.slice(0, 5);
    const suffix = upper.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Per HIBP docs, the Add-Padding header makes response sizes
      // uniform so a network observer can't infer how popular the
      // prefix is from response length alone.
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) {
      return { breached: false, count: 0, error: `HIBP HTTP ${res.status}` };
    }
    const body = await res.text();
    // Body format: "<19-char hex suffix>:<count>\r\n..." repeated.
    const lines = body.split('\n');
    for (const line of lines) {
      const [hash, countStr] = line.trim().split(':');
      if (hash === suffix) {
        return { breached: true, count: parseInt(countStr, 10) || 0 };
      }
    }
    return { breached: false, count: 0 };
  } catch (e: any) {
    // Network / SHA-1 / parse failure — fail open so the user isn't
    // blocked. Length + complexity validations still apply at the
    // earlier validation step.
    return { breached: false, count: 0, error: e?.message ?? 'unknown' };
  }
};
