import '../global.css';
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import * as Sentry from '@sentry/react-native';
import { COLORS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';

// Sentry init — fires at module load so error boundaries + unhandled
// promise rejections are captured even if RootLayout never mounts.
//
// `enabled: !__DEV__` keeps local-dev noise out of the production
// project; flip if you want to verify the pipeline in dev.
//
// The `beforeSend` redactor strips PII patterns that Firebase Auth /
// validation messages frequently leak: full email addresses, E.164
// phone numbers, and Firebase auth-user UIDs. Sentry's own scrubber
// covers query strings + form fields by default; this catches the
// shapes that show up specifically in error messages and breadcrumb
// strings.
const SENTRY_PII_SCRUB = (s: string): string =>
  s
    .replace(/[\w.+-]+@[\w.-]+\.\w{2,}/g, '[email]')
    .replace(/\+\d{6,15}/g, '[phone]');

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN && !__DEV__,
  // Keep tracing modest until usage shows we need more.
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Sentry will fill `user.email`/`user.username` automatically if a
    // caller sets them via `Sentry.setUser` — defensively drop the
    // PII-shaped fields and keep only the opaque id.
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }
    if (event.message) {
      event.message = SENTRY_PII_SCRUB(event.message);
    }
    if (event.exception?.values) {
      for (const v of event.exception.values) {
        if (v.value) v.value = SENTRY_PII_SCRUB(v.value);
      }
    }
    if (event.breadcrumbs) {
      for (const b of event.breadcrumbs) {
        if (b.message) b.message = SENTRY_PII_SCRUB(b.message);
        if (b.data) {
          for (const k of Object.keys(b.data)) {
            const v = b.data[k];
            if (typeof v === 'string') b.data[k] = SENTRY_PII_SCRUB(v);
          }
        }
      }
    }
    return event;
  },
});

function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    // Initialize RevenueCat. SDK keys are PUBLIC by design (they live in
    // the client bundle); the secret API key is server-only and lives in
    // functions config — see firebase/functions/src/index.ts.
    //
    // Production builds MUST set platform-specific keys via:
    //   eas secret:create --name EXPO_PUBLIC_RC_KEY_IOS     --value appl_...
    //   eas secret:create --name EXPO_PUBLIC_RC_KEY_ANDROID --value goog_...
    // RC issues distinct SDK keys per platform; reusing one across both
    // is a misconfiguration that breaks entitlement sync.
    //
    // Falls back to the prior in-source test key so dev workflow keeps
    // working until the env is provisioned. The fallback warns once so
    // it cannot silently ship to production.
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);

    const FALLBACK_TEST_KEY = 'test_sKPkJSClyWQEckKZvsRViUnSJBH';
    const envKey = Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_RC_KEY_IOS
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_RC_KEY_ANDROID
        : undefined;

    const apiKey = envKey ?? FALLBACK_TEST_KEY;
    if (!envKey) {
      console.warn(
        '[RevenueCat] EXPO_PUBLIC_RC_KEY_' +
          (Platform.OS === 'ios' ? 'IOS' : 'ANDROID') +
          ' not set — falling back to in-source test key. ' +
          'Set the env via `eas secret:create` before shipping a release build.'
      );
    }

    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Purchases.configure({ apiKey });
    }

    const unsub = initialize();
    return unsub;
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
});

// Sentry.wrap enables navigation tracing + error boundary integration.
// Wraps as default export per the Sentry RN docs.
export default Sentry.wrap(RootLayout);
