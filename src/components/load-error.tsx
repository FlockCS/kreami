import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Exists because a silent failure already shipped: an ambiguous PostgREST
 * embed made the experience thread return HTTP 300, and with no error state
 * the screen simply said "No Kreamis yet". A list that failed to load and a
 * list that is genuinely empty must never look the same.
 */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <View className="py-8">
      <Text className="font-serif text-[22px] leading-7 text-ink">That did not load</Text>
      <Text className="mt-2 font-sans text-[13px] leading-5" style={{ color: colors.accent }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          className="mt-4 min-h-11 justify-center"
        >
          <Text className="font-sans text-[14px] text-ink underline">Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
