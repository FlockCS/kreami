import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from './auth';
import { supabase } from './supabase';

/** `kreami_replied` is in the enum but never generated — replies are cut (D18). */
export type NotificationKind =
  'new_follower' | 'kreami_liked' | 'kreami_replied' | 'experience_activity';

export type ActivityItem = {
  id: string;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  /** Null once the actor deletes their account. The row survives them. */
  actor_id: string | null;
  actor_handle: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  kreami_id: string | null;
  kreami_rating: number | null;
  kreami_note: string | null;
  experience_id: string | null;
  experience_title: string | null;
  experience_slug: string | null;
};

const PAGE = 30;

export function useActivityFeed(enabled = true) {
  return useInfiniteQuery({
    queryKey: ['activity'],
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ActivityItem[]> => {
      const { data, error } = await supabase.rpc('activity_feed', {
        before: pageParam ?? undefined,
        lim: PAGE,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ActivityItem[];
    },
    getNextPageParam: (last: ActivityItem[]) =>
      last.length < PAGE ? undefined : (last[last.length - 1]?.created_at ?? undefined),
  });
}

/**
 * The badge number. A count, not a fetch of the rows: this runs on every app
 * open and on a schedule, and the tab only ever renders "9+" past nine.
 *
 * RLS restricts notifications to their owner, so this needs no filter beyond
 * `read_at is null` — there is nothing else it could count.
 */
export function useUnreadCount() {
  const { session } = useSession();

  return useQuery({
    queryKey: ['unread-count', session?.user.id],
    enabled: Boolean(session?.user.id),
    staleTime: 30_000,
    // The one place polling earns its keep: without push, this is how a badge
    // appears while somebody has the app open. Cheap — it is a covered index
    // scan returning one integer.
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/**
 * Clears the badge. Called when the Activity tab is opened, which is the
 * moment the notifications have in fact been seen.
 *
 * The rows keep their read_at, so the list can still show what is new in this
 * visit even though the badge is already gone.
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('mark_notifications_read');
      if (error) throw new Error(error.message);
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });
}
