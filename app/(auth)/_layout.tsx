import { useEffect } from 'react';
import { Stack, useSegments, useLocalSearchParams, router } from 'expo-router';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { correctAuthRoute, isAllowedAuthRoute } from '@/utils/authStage';

export default function AuthLayout() {
  const { isAuthenticated, isLoading, profile, user, emailVerified } = useAuthStore();
  const segments = useSegments();
  // segments inside this layout are like ['(auth)', 'id-verify'] — pick the
  // tail so we know which auth subroute the user is currently on.
  const currentSubroute = segments[segments.length - 1] ?? '';
  // `?edit=1` is the explicit signal from Settings → Edit Profile that a
  // fully-set-up user is intentionally re-opening profile-setup. The guard
  // uses this to skip the "bounce to /(tabs)" path for complete profiles.
  const params = useLocalSearchParams<{ edit?: string }>();
  const editMode = params.edit === '1';

  // Derived from the auth-store user. Email-method users get the
  // verify-email gate; phone users skip it (Firebase returns
  // emailVerified=true for them).
  const isEmailUser = !!user?.providerData?.some((p) => p.providerId === 'password');

  useEffect(() => {
    // Wait for auth bootstrap. Also wait for the profile to load if the user
    // is authenticated — without this, a freshly-authed user with profile===null
    // would be routed to '/(auth)/profile-setup' even if they're actually
    // already verified (profile fetch in flight).
    if (isLoading) return;
    if (isAuthenticated && !profile) return;

    const gate = { isAuthenticated, profile, isEmailUser, emailVerified };
    if (!isAllowedAuthRoute(currentSubroute, gate, editMode)) {
      const target = correctAuthRoute(gate);
      router.replace(target as never);
    }
  }, [isLoading, isAuthenticated, profile, currentSubroute, editMode, isEmailUser, emailVerified]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
