import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ProfileView } from '@/components/profile-view';
import { useProfile, useSession } from '@/lib/auth';
import { usePublicProfile } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

export default function Me() {
  const router = useRouter();
  const { session } = useSession();
  const own = useProfile();
  const profile = usePublicProfile(own.data?.handle ?? undefined);

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
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          className="min-h-11 justify-center"
        >
          <Text className="font-sans text-[13px] text-muted">Settings</Text>
        </Pressable>
      </View>

      {profile.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : profile.data ? (
        <ProfileView
          profile={profile.data}
          action={
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => router.push('/edit-profile')}
            />
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
