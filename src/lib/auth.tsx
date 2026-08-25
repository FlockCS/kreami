import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type Profile = {
  id: string;
  handle: string | null;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  kreami_count: number;
  follower_count: number;
  following_count: number;
};

type SessionState = {
  session: Session | null;
  /** True until the stored session has been restored. Never guess before this. */
  isRestoring: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, isRestoring: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isRestoring: true });
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;

    // Restore first, so the router never decides a route from a null session
    // that simply has not loaded yet.
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, isRestoring: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({ session, isRestoring: false });
      // The profile belongs to whoever is signed in; never let one user's
      // cached profile survive into another's session.
      queryClient.removeQueries({ queryKey: ['profile'] });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession() {
  return use(SessionContext);
}

/**
 * The signed-in user's own profile. Returns `undefined` while loading and
 * `null` when signed out. A profile always exists once a session does — the
 * database trigger guarantees it — but `handle` is null until claimed.
 */
export function useProfile() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, handle, display_name, bio, avatar_url, kreami_count, follower_count, following_count',
        )
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/**
 * Where the OAuth provider sends the browser back to. On web this is the site
 * origin; Supabase appends the session to the URL fragment and the client picks
 * it up because `detectSessionInUrl` is on.
 *
 * On native this resolves to `kreami://` — which needs iOS and Android OAuth
 * client IDs that do not exist yet. See BACKLOG.md.
 */
function redirectUrl() {
  return Linking.createURL('/');
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl(),
      // On native the browser must be opened by us, not by the SDK.
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: redirectUrl() },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}
