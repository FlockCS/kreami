import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from './supabase';

/**
 * Mirrors normalize_experience_title() in the database exactly: lowercase,
 * collapse runs of whitespace, trim. Nothing else — no punctuation stripping,
 * no plural folding, no unaccenting. See docs/05-experience-matching.md.
 *
 * Used only to *predict* what the server will match, never to decide anything.
 * If the two ever drift, the database is right and this is wrong.
 */
export function normalizeExperienceTitle(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

export const MAX_TITLE_LENGTH = 80;
export const MAX_NOTE_LENGTH = 150;
/** Averages are hidden below this many Kreamis. */
export const MIN_KREAMIS_FOR_AVERAGE = 3;

export type ExperienceMatch = {
  id: string;
  title: string;
  slug: string;
  kreami_count: number;
  avg_kreams: number | null;
  score: number;
};

export type Experience = {
  id: string;
  title: string;
  slug: string;
  kreami_count: number;
  rating_sum: number;
};

export type KreamiWithAuthor = {
  id: string;
  rating: number;
  note: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  profiles: { handle: string | null; display_name: string; avatar_url: string | null } | null;
};

export function averageOf(e: Pick<Experience, 'kreami_count' | 'rating_sum'>): number | null {
  if (e.kreami_count < MIN_KREAMIS_FOR_AVERAGE) return null;
  return Math.round((e.rating_sum / e.kreami_count) * 10) / 10;
}

/**
 * Search-as-you-type. Under the exact-match rule this is the only thing that
 * steers people into an existing thread before a duplicate exists, so it runs
 * from the second character and stays deliberately generous.
 */
export function useSearchExperiences(query: string) {
  const normalized = normalizeExperienceTitle(query);
  return useQuery({
    queryKey: ['search-experiences', normalized],
    enabled: normalized.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<ExperienceMatch[]> => {
      const { data, error } = await supabase.rpc('search_experiences', { q: normalized, lim: 8 });
      if (error) throw new Error(error.message);
      return (data ?? []) as ExperienceMatch[];
    },
  });
}

/**
 * The experience an exact match would land on, if one exists. Lets the rating
 * step say "joining 38 Kreamis" before anything is written. A plain filtered
 * read, so it cannot create anything — unlike resolve_experience(), which is
 * internal for exactly that reason.
 */
export function useExactExperience(title: string) {
  const normalized = normalizeExperienceTitle(title);
  return useQuery({
    queryKey: ['exact-experience', normalized],
    enabled: normalized.length >= 2,
    staleTime: 15_000,
    queryFn: async (): Promise<Experience | null> => {
      const { data, error } = await supabase
        .from('experiences')
        .select('id, title, slug, kreami_count, rating_sum')
        .eq('normalized_title', normalized)
        .is('merged_into_experience_id', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useExperienceBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['experience', slug],
    enabled: Boolean(slug),
    queryFn: async (): Promise<Experience | null> => {
      const { data, error } = await supabase.rpc('get_experience_by_slug', { s: slug! });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as Experience | null;
    },
  });
}

export type ThreadSort = 'recent' | 'top' | 'highest' | 'lowest';

const SORTS: Record<ThreadSort, { column: string; ascending: boolean }> = {
  recent: { column: 'created_at', ascending: false },
  top: { column: 'like_count', ascending: false },
  highest: { column: 'rating', ascending: false },
  lowest: { column: 'rating', ascending: true },
};

export function useThread(experienceId: string | undefined, sort: ThreadSort = 'recent') {
  return useQuery({
    queryKey: ['thread', experienceId, sort],
    enabled: Boolean(experienceId),
    queryFn: async (): Promise<KreamiWithAuthor[]> => {
      const { column, ascending } = SORTS[sort];
      const { data, error } = await supabase
        .from('kreamis')
        // The FK must be named. Once `likes` existed there were two paths from
        // kreamis to profiles — the author (kreamis.user_id) and everyone who
        // liked it (via likes) — and PostgREST answers an ambiguous embed with
        // HTTP 300 rather than picking one.
        .select(
          'id, rating, note, created_at, like_count, reply_count, profiles!kreamis_user_id_fkey(handle, display_name, avatar_url)',
        )
        .eq('experience_id', experienceId!)
        .order(column, { ascending })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as KreamiWithAuthor[];
    },
  });
}

export function useDistribution(experienceId: string | undefined) {
  return useQuery({
    queryKey: ['distribution', experienceId],
    enabled: Boolean(experienceId),
    queryFn: async (): Promise<{ rating: number; count: number }[]> => {
      const { data, error } = await supabase.rpc('experience_distribution', {
        target: experienceId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { rating: number; count: number }[];
    },
  });
}

export type PostKreamiResult = {
  kreami_id: string;
  experience_id: string;
  experience_slug: string;
  was_edit: boolean;
};

/**
 * The single write that matters. Resolution and the rating happen in one
 * transaction inside the database — two round trips could create an experience
 * and then fail to rate it.
 */
export function usePostKreami() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      rating: number;
      note?: string | null;
    }): Promise<PostKreamiResult> => {
      const { data, error } = await supabase.rpc('post_kreami', {
        raw_title: input.title,
        rating: input.rating,
        note: input.note ?? undefined,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      return row as PostKreamiResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['experience', result.experience_slug] });
      queryClient.invalidateQueries({ queryKey: ['thread', result.experience_id] });
      queryClient.invalidateQueries({ queryKey: ['distribution', result.experience_id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['search-experiences'] });
      queryClient.invalidateQueries({ queryKey: ['exact-experience'] });
    },
  });
}
