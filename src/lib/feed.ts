import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from './supabase';

export type FeedItem = {
  kreami_id: string;
  rating: number;
  note: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  experience_id: string;
  experience_title: string;
  experience_slug: string;
  experience_avg: number | null;
  experience_kreami_count: number;
};

const PAGE = 20;

/**
 * Keyset pagination, not OFFSET. OFFSET degrades linearly and — worse for a
 * feed — duplicates rows when something new arrives mid-scroll. The cursor is
 * the created_at of the last row already held.
 */
function feedQuery(fn: 'home_feed' | 'global_feed') {
  return {
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<FeedItem[]> => {
      const { data, error } = await supabase.rpc(fn, {
        before: pageParam ?? undefined,
        lim: PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedItem[];
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedItem[]) =>
      last.length < PAGE ? undefined : (last[last.length - 1]?.created_at ?? undefined),
  };
}

export function useHomeFeed(enabled = true) {
  return useInfiniteQuery({ queryKey: ['home-feed'], enabled, ...feedQuery('home_feed') });
}

export function useGlobalFeed(enabled = true) {
  return useInfiniteQuery({ queryKey: ['global-feed'], enabled, ...feedQuery('global_feed') });
}

export type ActiveExperience = {
  id: string;
  title: string;
  slug: string;
  kreami_count: number;
  avg_kreams: number | null;
  recent_count: number;
};

export function useActiveExperiences() {
  return useQuery({
    queryKey: ['active-experiences'],
    staleTime: 60_000,
    queryFn: async (): Promise<ActiveExperience[]> => {
      const { data, error } = await supabase.rpc('active_experiences', { lim: 20 });
      if (error) throw new Error(error.message);
      return (data ?? []) as ActiveExperience[];
    },
  });
}

/**
 * Likes are optimistic: trivially reversible, and the latency is the entire
 * interaction. Posting a Kreami deliberately is not — the server decides which
 * experience it lands on, and guessing wrong shows somebody the wrong thread.
 */
export function useToggleLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kreamiId: string) => {
      const { data, error } = await supabase.rpc('toggle_like', { target: kreamiId });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return row as { liked: boolean; like_count: number };
    },
    onMutate: async (kreamiId) => {
      await queryClient.cancelQueries({ queryKey: ['home-feed'] });
      const snapshots = queryClient.getQueriesData<{ pages: FeedItem[][] }>({
        predicate: (q) => q.queryKey[0] === 'home-feed' || q.queryKey[0] === 'global-feed',
      });
      for (const [key, value] of snapshots) {
        if (!value) continue;
        queryClient.setQueryData(key, {
          ...value,
          pages: value.pages.map((page) =>
            page.map((item) =>
              item.kreami_id === kreamiId
                ? {
                    ...item,
                    liked_by_me: !item.liked_by_me,
                    like_count: item.like_count + (item.liked_by_me ? -1 : 1),
                  }
                : item,
            ),
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      // Put back exactly what was there; a like is not worth a wrong number.
      for (const [key, value] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      queryClient.invalidateQueries({ queryKey: ['global-feed'] });
    },
  });
}

/**
 * Follow and unfollow. Optimistic like a like is: the button has to answer
 * immediately or every row in a follower list feels broken.
 *
 * Note what is NOT invalidated afterwards — the follow list you are looking
 * at. Unfollowing somebody from your own Following tab would make their row
 * vanish under your thumb, which reads as "did I just delete them?". The row
 * stays, showing Follow, until the list is opened afresh.
 */
export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase.rpc('toggle_follow', { target: profileId });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return row as { following: boolean; follower_count: number };
    },
    onMutate: async (profileId) => {
      await queryClient.cancelQueries({ queryKey: ['follow-list'] });
      const snapshots: [readonly unknown[], unknown][] = [];

      // Every cache that holds a person with a follow button, in whichever
      // shape it holds them. Missing one shows a button that did not respond
      // to being pressed, which is the specific thing optimism is for.
      for (const [key, value] of queryClient.getQueriesData<unknown>({
        predicate: (q) => PERSON_CACHES.includes(q.queryKey[0] as string),
      })) {
        if (!value) continue;
        const patched = patchPeople(value, profileId);
        if (patched === value) continue;
        snapshots.push([key, value]);
        queryClient.setQueryData(key, patched);
      }

      return { snapshots };
    },
    onError: (_err, _id, context) => {
      for (const [key, value] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, value);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });
}

/** Query keys whose data contains people with a follow button. */
const PERSON_CACHES = ['follow-list', 'public-profile', 'search-profiles', 'suggested-profiles'];

type Person = { id: string; is_following: boolean; follower_count: number };

/**
 * Applies the flip through whichever container the cache uses: a single
 * profile, a flat list of results, or an infinite query's pages. Returns the
 * original object when nothing matched, so the caller can skip snapshotting a
 * cache it did not touch.
 */
function patchPeople(value: unknown, profileId: string): unknown {
  if (Array.isArray(value)) {
    return value.some((p: Person) => p?.id === profileId)
      ? value.map((p: Person) => flipFollow(p, profileId))
      : value;
  }

  if (value && typeof value === 'object' && 'pages' in value) {
    const paged = value as { pages: Person[][] };
    return paged.pages.some((page) => page.some((p) => p?.id === profileId))
      ? { ...paged, pages: paged.pages.map((page) => page.map((p) => flipFollow(p, profileId))) }
      : value;
  }

  const single = value as Person | null;
  return single?.id === profileId ? flipFollow(single, profileId) : value;
}

/** Flips one person's follow state and their follower count, or returns them untouched. */
function flipFollow<T extends { id: string; is_following: boolean; follower_count: number }>(
  person: T,
  profileId: string,
): T {
  if (person.id !== profileId) return person;
  return {
    ...person,
    is_following: !person.is_following,
    follower_count: Math.max(0, person.follower_count + (person.is_following ? -1 : 1)),
  };
}

/** Whether the signed-in user follows someone. Null while unknown. */
export function useIsFollowing(profileId: string | undefined, viewerId: string | undefined) {
  return useQuery({
    queryKey: ['is-following', viewerId, profileId],
    enabled: Boolean(profileId && viewerId && profileId !== viewerId),
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from('follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('follower_id', viewerId!)
        .eq('followee_id', profileId!);
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
  });
}
