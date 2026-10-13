import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';

// Shared camera-permission helper. Pre-extraction, `selfie-verify` and
// `id-verify` each called `requestCameraPermissionsAsync` directly →
// two OS prompts on first run for the same permission (audit S2-3).
// This hook checks the current status first and only re-requests if
// not already granted, so the second screen sees an instant-granted
// path after the first screen's prompt.
export const useCameraPermission = () => {
  const ensureCameraPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.status === 'granted') return true;
    // OS-level "Don't ask again" — calling request again is a no-op that
    // returns the same denied status. Bail so the caller can show a clear
    // "open settings" error instead of spinning on a silent re-prompt.
    if (!current.canAskAgain) return false;
    const requested = await ImagePicker.requestCameraPermissionsAsync();
    return requested.status === 'granted';
  }, []);

  return { ensureCameraPermission };
};
