import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ProfileView } from '@/components/profile-view';
import { usePublicProfile } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

export default function PublicProfileScreen() {
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const profile = usePublicProfile(handle);

  // Reached by a direct link or a stale route. Your own profile lives in the tab.
  if (profile.data?.is_self) return <Redirect href="/me" />;

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center px-6 pb-3 pt-5">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-11 justify-center"
        >
          <Text className="font-sans text-[15px] text-ink">Back</Text>
        </Pressable>
      </View>

      {profile.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : profile.data ? (
        <ProfileView profile={profile.data} />
      ) : (
        <View className="px-6">
          <Text className="mt-8 font-serif text-[28px] text-ink">Not found</Text>
          <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
            There is nobody here by that name.
          </Text>
          <View className="mt-6">
            <Button label="Back" variant="secondary" onPress={() => router.replace('/')} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
