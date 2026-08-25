import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { PersonRow } from '@/components/person-row';
import { useProfile } from '@/lib/auth';
import { useSuggestedProfiles } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

/**
 * The last step of signing up: follow a few people, then rate something.
 *
 * The order is deliberate. Following is the cheap ask that makes the home feed
 * non-empty, but **getting somebody to post once during onboarding is worth
 * more than any other onboarding metric** (docs/08), so the filled button —
 * the only one on the screen — is the one that opens compose.
 *
 * Skippable without ceremony. A required onboarding step is a place to lose
 * people, and everything here is reachable later from Discover.
 */
export default function Welcome() {
  const router = useRouter();
  const profile = useProfile();
  const suggestions = useSuggestedProfiles();

  const following = profile.data?.following_count ?? 0;
  const people = suggestions.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Text className="pt-8 font-serif text-[32px] leading-10 text-ink">
          {profile.data?.handle ? `You’re in, @${profile.data.handle}` : 'You’re in'}
        </Text>
        <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
          Kreami is one scale for everything. Follow a few people so your feed has something in it,
          then rate something yourself.
        </Text>

        {suggestions.isPending ? (
          <ActivityIndicator className="mt-10" color={colors.muted} />
        ) : people.length > 0 ? (
          <>
            <Text className="pb-1 pt-8 font-sans text-[10px] tracking-label text-muted">
              PEOPLE TO FOLLOW
            </Text>
            {people.map((person) => (
              <PersonRow key={person.id} person={person} reason={person.reason} />
            ))}
          </>
        ) : (
          // Nothing curated yet — which is exactly the state this project is in
          // until the seed accounts exist (BACKLOG). Saying so beats an empty gap.
          <Text className="pt-8 font-sans text-[15px] leading-6 text-body">
            There is nobody to suggest yet. You are early.
          </Text>
        )}

        <View className="mt-10 gap-3">
          <Button label="Leave your first Kreami" onPress={() => router.replace('/compose')} />
          <Button
            label={following > 0 ? 'Go to my feed' : 'Skip for now'}
            variant="secondary"
            onPress={() => router.replace('/')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
