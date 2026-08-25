import { QueryClient } from '@tanstack/react-query';

/**
 * Feed and experience data is not real-time critical, and Supabase egress is the
 * first free-tier ceiling we expect to hit (see docs/03-architecture.md), so
 * defaults lean towards fewer refetches rather than fresher data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
