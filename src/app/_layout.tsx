import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
} from '@expo-google-fonts/archivo';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import '../global.css';

import { SessionProvider, useProfile, useSession } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { colors, fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * The web column. Wide enough for a 150-character note to breathe, narrow
 * enough that the mockups' proportions still hold.
 */
const COLUMN_WIDTH = 480;

/**
 * Sends people where they belong, and — just as importantly — does nothing
 * until it actually knows. Redirecting off a session that has merely not
 * finished restoring bounces a signed-in user to the sign-in screen on every
 * cold start.
 */
/**
 * Routes a signed-out visitor may see.
 *
 * Anonymous read is not an accident of the RLS policies, it is the top of the
 * funnel (docs/03, docs/04, docs/08): a shared /e/:slug has to render for
 * somebody who has never heard of Kreami, or sharing a link accomplishes
 * nothing. The guard used to send every session-less visitor to sign-in, which
 * made all of that unreachable — the anonymous grants were real and the door
 * to them was locked.
 *
 * An allowlist rather than a list of private routes, so the failure mode of
 * forgetting to add a screen is a sign-in prompt rather than a broken render.
 */
const PUBLIC_ROUTES = [
  'intro',
  'sign-in',
  '(tabs)', // the feed, which falls back to global when signed out
  '(tabs)/discover',
  'e/[slug]',
  'u/[handle]',
  'u/[handle]/follows',
];

function AuthGate({ children }: { children: ReactNode }) {
  const { session, isRestoring } = useSession();
  const profile = useProfile();
  const segments = useSegments();
  const router = useRouter();

  const atSignIn = segments[0] === 'sign-in';
  const atClaimHandle = segments[0] === 'claim-handle';
  const needsHandle = Boolean(profile.data && !profile.data.handle);
  const isPublic = PUBLIC_ROUTES.includes(segments.join('/'));

  useEffect(() => {
    if (isRestoring) return;

    if (!session) {
      // Reaching for something that needs an account is the moment to explain
      // what the account is for, so this lands on the pitch rather than on a
      // login form. Browsing stays browsable: every public route is left alone,
      // which is the whole point of the anonymous grants.
      if (!isPublic) router.replace('/intro');
      return;
    }

    // Signed in, but the profile has not arrived yet — decide nothing.
    if (profile.isPending) return;

    if (needsHandle) {
      if (!atClaimHandle) router.replace('/claim-handle');
      return;
    }

    // A handle was just claimed: the last onboarding step is next. Both this
    // and claim-handle's own success handler navigate there, so it does not
    // matter which of them wins the race — they agree.
    if (atClaimHandle) router.replace('/welcome');
    else if (atSignIn) router.replace('/');
  }, [
    isRestoring,
    session,
    profile.isPending,
    needsHandle,
    atSignIn,
    atClaimHandle,
    isPublic,
    router,
  ]);

  return children;
}

function Root() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
  });
  const { isRestoring } = useSession();

  const ready = (fontsLoaded || fontError) && !isRestoring;

  useEffect(() => {
    // Fall through on font errors rather than holding the splash forever — the
    // system fallback is readable, a permanently blank screen is not.
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthGate>
      <StatusBar style="dark" />
      {/*
        Kreami is a phone app that also runs in a browser. Letting a feed
        stretch to 2000px turns every card into a wide band of whitespace with
        a sentence lost in it, so on web the app is held to a single centred
        column and the hairlines give it an edge. On native this is a plain
        passthrough — the constraint would otherwise letterbox tablets.
      */}
      <View style={{ flex: 1, backgroundColor: colors.paper, alignItems: 'center' }}>
        <View
          style={[
            { flex: 1, width: '100%' },
            Platform.OS === 'web' && {
              maxWidth: COLUMN_WIDTH,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.rule,
            },
          ]}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.paper },
              headerStyle: { backgroundColor: colors.paper },
              headerTitleStyle: { fontFamily: fonts.serif, color: colors.ink },
              headerTintColor: colors.ink,
            }}
          />
        </View>
      </View>
    </AuthGate>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </QueryClientProvider>
  );
}
