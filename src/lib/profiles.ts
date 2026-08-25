import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useProfile } from './auth';
import { supabase } from './supabase';

export type PublicProfile = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  kreami_count: number;
  follower_count: number;
  following_count: number;
  /** The personality stat. Null until they have rated anything. */
  avg_kream_given: number | null;
  is_following: boolean;
  is_self: boolean;
};

export type ProfileKreami = {
  kreami_id: string;
  rating: number;
  note: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  experience_id: string;
  experience_title: string;
  experience_slug: string;
  experience_avg: number | null;
  experience_kreami_count: number;
};

export type ProfileSort = 'recent' | 'highest' | 'lowest';

export type FollowListKind = 'followers' | 'following';

/**
 * One person in a list, wherever that list came from — followers, following,
 * search results, suggestions. Every source computes `is_following` and
 * `is_self` for the viewer, which is what lets PersonRow render any of them.
 */
export type FollowRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number;
  /** When the edge was created. Doubles as the keyset cursor. Absent where there is no edge. */
  followed_at?: string;
  is_following: boolean;
  is_self: boolean;
};

/** A suggestion carries one extra line: why this person is worth following. */
export type SuggestedProfile = FollowRow & { reason: string | null };

const FOLLOW_PAGE = 30;

/**
 * People search. Goes through search_profiles() rather than a PostgREST
 * filter, because the filter had to be built by interpolating the query into
 * `.or(...)` — where a comma or a parenthesis is grammar, not text, and
 * searching for "a,b" changed what the filter meant. See the migration.
 */
export function useSearchProfiles(query: string) {
  const q = query.trim();

  return useQuery({
    queryKey: ['search-profiles', q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<FollowRow[]> => {
      const { data, error } = await supabase.rpc('search_profiles', { q, lim: 10 });
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowRow[];
    },
  });
}

/**
 * The hand-curated list shown to somebody who follows nobody. People you
 * already follow are filtered out server-side, so this shrinks as it is used.
 */
export function useSuggestedProfiles(enabled = true) {
  return useQuery({
    queryKey: ['suggested-profiles'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SuggestedProfile[]> => {
      const { data, error } = await supabase.rpc('suggested_profiles', { lim: 10 });
      if (error) throw new Error(error.message);
      return (data ?? []) as SuggestedProfile[];
    },
  });
}

/**
 * A follower or following list, keyset-paginated on the edge's created_at for
 * the same reason the feeds are: a list somebody is scrolling must not shuffle
 * or repeat when a new follow lands above them.
 */
export function useFollowList(kind: FollowListKind, profileId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['follow-list', kind, profileId],
    enabled: Boolean(profileId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FollowRow[]> => {
      const { data, error } = await supabase.rpc(
        kind === 'followers' ? 'profile_followers' : 'profile_following',
        { target: profileId!, before: pageParam ?? undefined, lim: FOLLOW_PAGE },
      );
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowRow[];
    },
    getNextPageParam: (last: FollowRow[]) =>
      last.length < FOLLOW_PAGE ? undefined : (last[last.length - 1]?.followed_at ?? undefined),
  });
}

export function usePublicProfile(handle: string | undefined) {
  return useQuery({
    queryKey: ['public-profile', handle],
    enabled: Boolean(handle),
    queryFn: async (): Promise<PublicProfile | null> => {
      const { data, error } = await supabase.rpc('public_profile', { target_handle: handle! });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as PublicProfile | null;
    },
  });
}

export function useProfileKreamis(profileId: string | undefined, sort: ProfileSort = 'recent') {
  return useQuery({
    queryKey: ['profile-kreamis', profileId, sort],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<ProfileKreami[]> => {
      const { data, error } = await supabase.rpc('profile_kreamis', {
        target: profileId!,
        sort,
        lim: 30,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProfileKreami[];
    },
  });
}

/**
 * Opens a profile. Your own always opens the You tab rather than /u/<handle>:
 * two routes showing the same person, one of which lacks your own controls, is
 * a way to end up looking at yourself as a stranger.
 */
export function useOpenProfile() {
  const router = useRouter();
  const own = useProfile();

  return (handle: string | null | undefined) => {
    if (!handle) return;
    if (own.data?.handle && handle.toLowerCase() === own.data.handle.toLowerCase()) {
      router.push('/me');
      return;
    }
    router.push({ pathname: '/u/[handle]', params: { handle } });
  };
}
