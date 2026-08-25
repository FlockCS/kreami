import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { KreamRating } from '@/components/kream-rating';
import { colors } from '@/theme/tokens';

/**
 * The first screen of onboarding: one sentence and an example.
 *
 * Deliberately not a carousel (docs/08). Nobody has ever been convinced to
 * sign up by screen three of a carousel, and the example does the explaining
 * that three screens of copy would fail to do — it shows the whole product:
 * a mundane thing, a number, and somebody's opinion about it.
 */
export default function Intro() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-1 justify-center px-6 pb-10">
        <Text className="font-serif text-[44px] leading-[48px] text-ink">Kreami</Text>
        <Text className="mt-4 font-sans text-[17px] leading-7 text-body">
          Rate literally any experience, on one scale. Not restaurants. Not films. The 3am airport,
          the good chair, the queue that moved.
        </Text>

        <View className="mt-10 border-y border-rule py-6">
          <Text className="font-sans text-[10px] tracking-label text-muted">FOR EXAMPLE</Text>
          <Text className="mt-3 font-serif text-[26px] leading-8 text-ink">
            Finding a seat on a full train
          </Text>
          <View className="mt-3">
            <KreamRating rating={5} size={16} showLabel />
          </View>
          <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
            Window, forward-facing, nobody beside me. Nothing else today will beat it.
          </Text>
        </View>

        <View className="mt-10 gap-3">
          <Button label="Get started" onPress={() => router.push('/sign-in')} />
          <Button
            label="Look around first"
            variant="secondary"
            onPress={() => router.replace('/')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
