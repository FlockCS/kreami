import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ProfileView } from '@/components/profile-view';
import { signOut, useProfile, useSession } from '@/lib/auth';
import { usePublicProfile } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

export default function Me() {
  const router = useRouter();
  const { session } = useSession();
  const own = useProfile();
  const profile = usePublicProfile(own.data?.handle ?? undefined);

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
    <SafeAreaView
      className="flex-1 bg-paper"
      style={{ backgroundColor: colors.paper }}
      edges={['top']}
    >
      <View className="flex-row items-center justify-between px-6 pb-3 pt-4">
        <Text className="font-sans text-[10px] tracking-label text-muted">YOUR PROFILE</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => leave.mutate()}
          className="min-h-11 justify-center"
        >
          <Text className="font-sans text-[13px] text-muted">Sign out</Text>
        </Pressable>
      </View>

      {profile.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : profile.data ? (
        <ProfileView
          profile={profile.data}
          action={
            <View>
              <Button label="Leave a Kreami" onPress={() => router.push('/compose')} />
              <Pressable
                accessibilityRole="button"
                onPress={confirmDelete}
                className="mt-3 h-11 items-center justify-center"
              >
                <Text className="font-sans text-[13px]" style={{ color: colors.accent }}>
                  Delete account
                </Text>
              </Pressable>
              {remove.error ? (
                <Text className="font-sans text-[13px]" style={{ color: colors.accent }}>
                  {remove.error.message}
                </Text>
              ) : null}
            </View>
          }
        />
      ) : (
        <View className="px-6">
          <Text className="mt-8 font-sans text-[15px] leading-6 text-body">
            Could not load your profile. Signed in as {session?.user.email}.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
