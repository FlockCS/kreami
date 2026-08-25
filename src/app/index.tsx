import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';

/**
 * Phase 0 foundation check. Not a product screen — it exists to prove the
 * stack is wired end to end, and is replaced by the home feed in Phase 3.
 * See docs/10-roadmap.md.
 */

type CheckStatus = 'ok' | 'pending';

function Row({ label, status, detail }: { label: string; status: CheckStatus; detail: string }) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-rule py-4">
      <View className="flex-1">
        <Text className="font-sans text-[15px] text-ink">{label}</Text>
        <Text className="mt-1 font-sans text-[13px] leading-5 text-muted">{detail}</Text>
      </View>
      <Text
        className={
          status === 'ok'
            ? 'font-sans-semibold text-[10px] tracking-label text-accent'
            : 'font-sans-semibold text-[10px] tracking-label text-muted'
        }
      >
        {status === 'ok' ? 'READY' : 'PENDING'}
      </Text>
    </View>
  );
}

export default function FoundationCheck() {
  // Proves the QueryClientProvider is mounted and queries resolve.
  const { data: queryOk } = useQuery({
    queryKey: ['foundation-check'],
    queryFn: async () => true,
  });

  /**
   * A real round trip: env -> client -> PostgREST -> Postgres -> back.
   * Imported lazily and inside the try so an unconfigured .env.local surfaces
   * as a failed check with the reason, rather than crashing the screen whose
   * whole job is to tell you it is unconfigured.
   */
  const supabaseCheck = useQuery({
    queryKey: ['supabase-reachable'],
    retry: false,
    queryFn: async () => {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase.rpc('keepalive');
      if (error) throw new Error(error.message);
      return data as string;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <ScrollView contentContainerClassName="px-6 pb-12">
        <Text className="mt-6 font-serif text-[34px] leading-none text-ink">Kreami</Text>
        <Text className="mt-2 font-sans text-[10px] tracking-label text-muted">
          PHASE 0 · FOUNDATION
        </Text>

        <View className="mt-5 h-px bg-ink" />

        <Text className="mt-5 font-sans text-[15px] leading-6 text-body">
          Nothing here is the product. This screen confirms the toolchain is standing before any
          feature work lands on top of it.
        </Text>

        <View className="mt-6">
          <Row
            label="Typefaces"
            status="ok"
            detail="Instrument Serif and Archivo — this heading is the serif, this line is the sans."
          />
          <Row
            label="Styling"
            status="ok"
            detail="NativeWind, with the Editorial tokens from the design canvas."
          />
          <Row
            label="Data layer"
            status={queryOk ? 'ok' : 'pending'}
            detail="TanStack Query provider mounted and resolving."
          />
          <Row
            label="Supabase"
            status={supabaseCheck.isSuccess ? 'ok' : 'pending'}
            detail={
              supabaseCheck.isSuccess
                ? `Reached the database. Server clock: ${supabaseCheck.data}`
                : supabaseCheck.isError
                  ? supabaseCheck.error.message
                  : 'Contacting the database…'
            }
          />
        </View>

        <View className="mt-8 flex-row items-baseline gap-3">
          <Text className="font-serif text-[46px] leading-none text-accent">0/5</Text>
          <Text className="font-sans text-[11px] tracking-label text-muted">KREAMS SO FAR</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
