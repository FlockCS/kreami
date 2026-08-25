import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { useProfile, useSession, type Profile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

/** Mirrors the check constraint on profiles.handle. Keep the two in step. */
const HANDLE = /^[a-z0-9_]{3,20}$/;

function localProblem(handle: string): string | null {
  if (handle.length === 0) return null;
  if (handle.length < 3) return 'At least 3 characters.';
  if (handle.length > 20) return 'At most 20 characters.';
  if (!HANDLE.test(handle)) return 'Letters, numbers and underscores only.';
  return null;
}

export default function ClaimHandle() {
  const { session } = useSession();
  const profile = useProfile();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [handle, setHandle] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce so a check does not fire on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(handle), 300);
    return () => clearTimeout(t);
  }, [handle]);

  const problem = localProblem(handle);
  const readyToCheck = debounced.length > 0 && localProblem(debounced) === null;

  const availability = useQuery({
    queryKey: ['handle-available', debounced],
    enabled: readyToCheck,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('handle_available', { candidate: debounced });
      if (error) throw new Error(error.message);
      return data as boolean;
    },
  });

  const claim = useMutation({
    mutationFn: async (value: string) => {
      const { data, error } = await supabase.rpc('claim_handle', { new_handle: value });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: (claimed) => {
      // Write the handle straight into the cache rather than navigating and
      // hoping a refetch lands first. It did not: the next screen greeted
      // people as "You're in, @" because it rendered against a profile that
      // still said null. claim_handle returns the handle it claimed, so there
      // is nothing to wait for.
      queryClient.setQueryData(['profile', session?.user.id], (old: Profile | null | undefined) =>
        old ? { ...old, handle: claimed } : old,
      );
      router.replace('/welcome');

      // Still refetch, because the server may have normalised something.
      queryClient.invalidateQueries({ queryKey: ['profile', session?.user.id] });
    },
  });

  const checking = readyToCheck && availability.isFetching;
  const taken = readyToCheck && availability.data === false;
  const free = readyToCheck && availability.data === true;
  const canSubmit = free && !claim.isPending;

  let status: { text: string; tone: 'muted' | 'accent' } | null = null;
  if (problem) status = { text: problem, tone: 'accent' };
  else if (checking) status = { text: 'Checking…', tone: 'muted' };
  else if (taken) status = { text: 'Taken. Try another.', tone: 'accent' };
  else if (free) status = { text: 'Available.', tone: 'muted' };

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-1 px-6 pb-10 pt-8">
        <Text className="font-sans text-[10px] tracking-label text-muted">
          ONE LAST THING{profile.data ? `, ${profile.data.display_name.toUpperCase()}` : ''}
        </Text>
        <Text className="mt-3 font-serif text-[38px] leading-none text-ink">Pick a handle</Text>
        <Text className="mt-4 font-sans text-[15px] leading-6 text-body">
          This is how people find you. You can change it later, but only once every 30 days.
        </Text>

        <View className="mt-9 flex-row items-baseline border-b border-ink pb-2">
          <Text className="font-serif text-[28px] text-muted">@</Text>
          <TextInput
            value={handle}
            onChangeText={(t) => setHandle(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourname"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={() => canSubmit && claim.mutate(handle)}
            accessibilityLabel="Your handle"
            className="ml-1 flex-1 font-serif text-[28px] text-ink"
          />
        </View>

        <View className="mt-3 h-5 flex-row items-center justify-between">
          <Text
            className="font-sans text-[13px]"
            style={{ color: status?.tone === 'accent' ? colors.accent : colors.muted }}
          >
            {status?.text ?? ''}
          </Text>
          <Text className="font-sans text-[11px] text-muted">{20 - handle.length} left</Text>
        </View>

        {claim.error ? (
          <Text className="mt-3 font-sans text-[13px] leading-5" style={{ color: colors.accent }}>
            {claim.error.message}
          </Text>
        ) : null}

        <View className="flex-1" />

        <Button
          label="Continue"
          loading={claim.isPending}
          disabled={!canSubmit}
          onPress={() => claim.mutate(handle)}
        />
      </View>
    </SafeAreaView>
  );
}
