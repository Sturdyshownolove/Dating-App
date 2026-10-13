import { Platform } from 'react-native';
import functions from '@react-native-firebase/functions';
import { firebaseStorage } from './firebase';

type SignKind = 'photo' | 'chat' | 'verification';

interface SignedUploadParams {
  cloud_name: string;
  api_key: string;
  folder: string;
  public_id: string;
  timestamp: number;
  // `fl_strip_profile` since 2026-05-24 to strip EXIF/IPTC/XMP/ICC
  // metadata at ingest (audit S2-1). Signed server-side; must be
  // sent verbatim or Cloudinary's signature check rejects.
  transformation?: string;
  signature: string;
}

/**
 * Request signed Cloudinary upload params from the `signUpload` Cloud Function,
 * then POST the file to Cloudinary using those server-chosen params. The unsigned
 * preset is no longer used — Cloudinary rejects the upload unless the signature
 * matches the params, and the CF owns the folder + public_id so the client can't
 * tamper with the destination.
 */
const uploadSigned = async (
  kind: SignKind,
  uri: string,
  mime: string,
  extra?: { matchId?: string }
): Promise<string | null> => {
  try {
    const callable = functions().httpsCallable('signUpload');
    const result = await callable({ kind, mime, matchId: extra?.matchId });
    const params = result.data as SignedUploadParams;

    const uploadUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
    const formData = new FormData();
    formData.append('file', {
      uri: uploadUri,
      type: mime,
      name: `upload_${Date.now()}`,
    } as any);
    formData.append('api_key', params.api_key);
    formData.append('timestamp', String(params.timestamp));
    formData.append('folder', params.folder);
    formData.append('public_id', params.public_id);
    if (params.transformation) {
      formData.append('transformation', params.transformation);
    }
    formData.append('signature', params.signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${params.cloud_name}/image/upload`,
      {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    const data = await response.json();

    if (data.secure_url) return data.secure_url as string;
    console.error('Cloudinary upload error:', data);
    return null;
  } catch (error) {
    console.error('Signed upload error:', error);
    return null;
  }
};

// Infer content-type from the file extension so PNG/WebP picks aren't
// mislabeled as JPEG. The signUpload CF validates `mime` against
// jpeg/png/webp and Cloudinary stores the declared type. Defaults to
// jpeg for .jpg/.jpeg and any extensionless/unrecognized uri (the image
// picker's default output).
const mimeFromUri = (uri: string): string => {
  const path = uri.split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

/**
 * Upload a profile photo. The `signUpload` CF derives the owner uid from
 * the auth context and chooses the public_id, so the client passes only
 * the local file uri (the prior `userId` / `index` params were unused).
 */
export const uploadPhoto = async (uri: string): Promise<string | null> => {
  return uploadSigned('photo', uri, mimeFromUri(uri));
};

/**
 * Chat images go through Firebase Storage so the storage rules can gate
 * read access to match participants via firestore.get() on the parent
 * match doc. A leaked download URL is useless without a valid auth token
 * AND participant status — closes the leak-on-exfil risk of the prior
 * public-by-default Cloudinary path.
 *
 * The `signUpload` CF still supports kind='chat' as a defense-in-depth seam
 * (e.g. emergency rollback); no current caller routes through it.
 */
export const uploadChatImage = async (
  matchId: string,
  senderId: string,
  uri: string
): Promise<string | null> => {
  try {
    const uploadUri = Platform.OS === 'ios' ? uri.replace('file://', '') : uri;
    const path = `chats/${matchId}/${Date.now()}_${senderId.substring(0, 8)}`;
    const ref = firebaseStorage.ref(path);
    await ref.putFile(uploadUri);
    return await ref.getDownloadURL();
  } catch (error) {
    console.error('Firebase Storage chat upload error:', error);
    return null;
  }
};

/**
 * Server-authoritative photo delete. Delegates to the
 * `deletePhotoCallable` CF which verifies the URL is in the caller's
 * own `users/{uid}/photos/` Cloudinary namespace before destroying
 * the bytes (so a caller can't delete other users' photos by passing
 * their URL).
 *
 * Pre-fix this was a no-op stub — profile-edit photo removals
 * dropped the URL from the user doc but orphaned the bytes in
 * Cloudinary indefinitely. Account-deletion sweep only catches
 * them at full account delete; this fills the per-photo gap.
 */
export const deletePhoto = async (photoUrl: string): Promise<boolean> => {
  try {
    const callable = functions().httpsCallable('deletePhotoCallable');
    await callable({ url: photoUrl });
    return true;
  } catch (error) {
    console.error('deletePhoto failed:', error);
    return false;
  }
};

/**
 * Rewrite a Cloudinary secure_url with f_auto,q_auto,w_<width> transforms.
 * Returns the input untouched for non-Cloudinary URLs and for URLs that
 * already carry a transform segment (idempotent — safe to call repeatedly).
 */
export function cdnImage(url: string | undefined | null, width: number): string | undefined {
  if (!url) return url ?? undefined;
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
  const [base, after] = url.split('/upload/');
  const firstSeg = after.split('/')[0];
  if (/^[a-z]+_/.test(firstSeg)) return url;
  return `${base}/upload/f_auto,q_auto,w_${width}/${after}`;
}
