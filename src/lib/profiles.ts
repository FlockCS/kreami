import { useQuery } from '@tanstack/react-query';

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
