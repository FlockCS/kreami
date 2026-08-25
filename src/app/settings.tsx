import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut, useProfile, useSession } from '@/lib/auth';
import { removeOthers } from '@/lib/avatars';
import { supabase } from '@/lib/supabase';
import { useGoBack } from '@/lib/navigation';
import { colors } from '@/theme/tokens';

/**
 * Everything that is not "look at my Kreamis". Destructive and account-level
 * actions live here rather than on the profile: a profile is something you show
 * people, and Delete account does not belong next to your own face.
 */
export default function Settings() {
  const router = useRouter();
  const goBack = useGoBack('/me');
  const { session } = useSession();
  const profile = useProfile();

  const leave = useMutation({ mutationFn: signOut });
  const remove = useMutation({
    mutationFn: async () => {
      // The photo first, while there is still a session authorised to delete
      // it. Storage does not cascade from auth.users — nothing in Postgres can
      // reach it, because Supabase blocks direct SQL deletes from the storage
      // tables — so this call is the only thing standing between deleting your
      // account and leaving your face in a public bucket.
      if (session?.user.id) await removeOthers(session.user.id, null);

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
      <View className="flex-row items-center gap-4 px-6 pb-2 pt-5">
        <Pressable accessibilityRole="button" onPress={goBack} className="min-h-11 justify-center">
          <Text className="font-sans text-[15px] text-ink">Back</Text>
        </Pressable>
        <Text className="font-serif text-[26px] leading-none text-ink">Settings</Text>
      </View>
      <View className="mx-6 mt-2 h-px bg-ink" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Label>PROFILE</Label>
        <Row
          label="Photo"
          value={profile.data?.avatar_url ? 'Set' : 'Not set'}
          onPress={() => router.push('/edit-profile')}
        />
        <Row
          label="Display name"
          value={profile.data?.display_name}
          onPress={() => router.push('/edit-profile')}
        />
        <View className="border-b border-rule py-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-sans text-[15px] text-ink">Handle</Text>
            <Text className="font-sans text-[14px] text-muted">
              {profile.data?.handle ? `@${profile.data.handle}` : '—'}
            </Text>
          </View>
          <Text className="mt-2 font-sans text-[12px] text-muted">
            Can be changed once every 30 days.
          </Text>
        </View>
        <Row
          label="Bio"
          value={profile.data?.bio ?? 'Not set'}
          onPress={() => router.push('/edit-profile')}
        />

        <Label>ACCOUNT</Label>
        <View className="flex-row items-center justify-between border-b border-rule py-4">
          <Text className="font-sans text-[15px] text-ink">Email</Text>
          <Text className="font-sans text-[14px] text-muted">{session?.user.email}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => leave.mutate()}
          className="min-h-11 flex-row items-center justify-between border-b border-rule py-4"
        >
          <Text className="font-sans text-[15px] text-ink">Sign out</Text>
          <Text className="font-sans text-[14px] text-muted">›</Text>
        </Pressable>

        <Text className="pt-4 font-sans text-[12px] leading-5 text-muted">
          Your Kreamis are public and permanent, including edits.
        </Text>

        <Label>ABOUT</Label>
        <View className="flex-row items-center justify-between border-b border-rule py-4">
          <Text className="font-sans text-[15px] text-muted">Version</Text>
          <Text className="font-sans text-[14px] text-muted">0.1.0</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={confirmDelete}
          disabled={remove.isPending}
          className="min-h-11 flex-row items-center justify-between pt-8"
        >
          <Text className="font-sans-medium text-[15px]" style={{ color: colors.accent }}>
            Delete account
          </Text>
          <Text className="font-sans text-[14px]" style={{ color: colors.accent }}>
            ›
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

function Label({ children }: { children: string }) {
  return (
    <Text className="pb-1 pt-7 font-sans text-[10px] tracking-label text-muted">{children}</Text>
  );
}

function Row({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-between gap-4 border-b border-rule py-4"
    >
      <Text className="font-sans text-[15px] text-ink">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="font-sans text-[14px] text-muted" numberOfLines={1}>
          {value || '—'}
        </Text>
        <Text className="font-sans text-[14px] text-muted">›</Text>
      </View>
    </Pressable>
  );
}
