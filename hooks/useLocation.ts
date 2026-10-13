import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { db, Collections, serverTimestamp } from '@/services/firebase';
import { updateUserProfile } from '@/services/firestore';

interface LocationData {
  latitude: number;
  longitude: number;
  city?: string;
}

export const useLocation = (userId?: string) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        setLoading(false);
        return null;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc: LocationData = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };

      // Reverse geocode to get city
      try {
        const [place] = await Location.reverseGeocodeAsync(pos.coords);
        if (place?.city) loc.city = place.city;
      } catch {}

      setLocation(loc);

      // Split write: precise coords go to the owner-only
      // `users/{uid}/private/location` doc (broad users-read rule would
      // otherwise turn lat/long into a stalker target). City stays on the
      // parent user doc so profile cards can render "Name · City" without
      // a second read. Established pattern — see
      // 06_Reports/security_push_token_private_subcollection_2026-05-24.
      if (userId) {
        await db
          .collection(Collections.USERS).doc(userId)
          .collection('private').doc('location')
          .set(
            {
              latitude: loc.latitude,
              longitude: loc.longitude,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        await updateUserProfile(userId, { location: { city: loc.city ?? null } });
      }

      setLoading(false);
      return loc;
    } catch (err: any) {
      setError(err.message || 'Failed to get location');
      setLoading(false);
      return null;
    }
  };

  return { location, error, loading, requestLocation };
};
