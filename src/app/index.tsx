import { useMutation } from '@tanstack/react-query';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { signOut, useProfile, useSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

/**
 * Phase 1 landing. Proves identity end to end: who you are, where the profile
 * came from, and that signing out and deleting the account both work.
 * The home feed replaces this in Phase 3 — see docs/10-roadmap.md.
 */
export default function Home() {
  const { session } = useSession();
  const profile = useProfile();

  const leave = useMutation({ mutationFn: signOut });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw new Error(error.message);
      await supabase.auth.signOut();
    },
  });

  function confirmDelete() {
    const message =
      'This permanently deletes your account and every Kreami you have left. It cannot be undone.';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) remove.mutate();
      return;
    }
    Alert.alert('Delete account?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <ScrollView contentContainerClassName="px-6 pb-12">
        <Text className="mt-6 font-serif text-[34px] leading-none text-ink">Kreami</Text>
        <Text className="mt-2 font-sans text-[10px] tracking-label text-muted">
          PHASE 1 · SIGNED IN
        </Text>

        <View className="mt-5 h-px bg-ink" />

        <View className="mt-7 flex-row items-center gap-4">
          <View className="h-16 w-16 rounded-full" style={{ backgroundColor: colors.fill }} />
          <View className="flex-1">
            <Text className="font-serif text-[30px] leading-9 text-ink">
              {profile.data?.display_name ?? '…'}
            </Text>
            <Text className="mt-1 font-sans text-[13px] text-muted">
              {profile.data?.handle ? `@${profile.data.handle}` : 'no handle'}
            </Text>
          </View>
        </View>

        <View className="mt-7 border-y border-rule py-4">
          <Text className="font-sans text-[10px] tracking-label text-muted">SIGNED IN AS</Text>
          <Text className="mt-2 font-sans text-[15px] text-body">{session?.user.email}</Text>
          <Text className="mt-1 font-sans text-[12px] text-muted">
            via {session?.user.app_metadata.provider ?? 'unknown'}
          </Text>
        </View>

        <Text className="mt-7 font-sans text-[15px] leading-6 text-body">
          Identity works. The feed, the compose flow and topic threads arrive in Phases 2 and 3.
        </Text>

        <View className="mt-8">
          <Button
            label="Sign out"
            variant="secondary"
            loading={leave.isPending}
            onPress={() => leave.mutate()}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={remove.isPending}
          onPress={confirmDelete}
          className="mt-3 h-14 items-center justify-center"
        >
          <Text className="font-sans text-[14px]" style={{ color: colors.accent }}>
            Delete account
          </Text>
        </Pressable>

        {remove.error ? (
          <Text className="mt-2 font-sans text-[13px]" style={{ color: colors.accent }}>
            {remove.error.message}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
