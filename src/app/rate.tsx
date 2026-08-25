import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { KreamPicker, KreamRating } from '@/components/kream-rating';
import { averageOf, MAX_NOTE_LENGTH, useExactExperience, usePostKreami } from '@/lib/experiences';
import { colors } from '@/theme/tokens';

/**
 * Step 2 of 2: the rating.
 *
 * There is no confirmation step between this and step 1. An exact match joins
 * that thread, anything else becomes a new experience, and neither asks. The
 * "joining N Kreamis" line below is context, not a question — see D4.
 */
export default function Rate() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string }>();
  const title = (params.title ?? '').toString();

  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const existing = useExactExperience(title);
  const post = usePostKreami();

  const average = existing.data ? averageOf(existing.data) : null;
  const canPost = rating !== null && !post.isPending;

  function submit() {
    if (rating === null) return;
    post.mutate(
      { title, rating, note: note.trim() || null },
      {
        onSuccess: (result) => {
          router.replace({ pathname: '/e/[slug]', params: { slug: result.experience_slug } });
        },
      },
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-5">
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-2">
          <Text className="font-sans text-[15px] text-ink">Back</Text>
        </Pressable>
        <Text className="font-sans text-[10px] tracking-label text-muted">2 OF 2</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.dismissTo('/')}
          className="py-2"
        >
          <Text className="font-sans text-[15px] text-muted">Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="px-6 pb-10" keyboardShouldPersistTaps="handled">
        <Text className="font-sans text-[10px] tracking-label text-muted">YOU ARE RATING</Text>
        <Text className="mt-3 font-serif text-[30px] leading-9 text-ink">{title}</Text>
        <Text className="mt-2 font-sans text-[12px] text-muted">
          {existing.data
            ? `Joining ${existing.data.kreami_count} ${
                existing.data.kreami_count === 1 ? 'Kreami' : 'Kreamis'
              }${average !== null ? ` · ${average.toFixed(1)} average` : ''}`
            : 'Nobody has rated this yet. You are first.'}
        </Text>

        <View className="mt-6 h-px bg-rule" />

        <View className="mt-9 items-center">
          {rating === null ? (
            <Text className="font-sans text-[15px] text-muted">How many Kreams?</Text>
          ) : (
            <KreamRating rating={rating} size={30} numeralSize={44} showLabel />
          )}
        </View>

        <View className="mt-8">
          <KreamPicker value={rating} onChange={setRating} />
        </View>

        <View className="mt-10 h-px bg-rule" />

        <Text className="mt-6 font-sans text-[10px] tracking-label text-muted">
          ADD A NOTE (OPTIONAL)
        </Text>
        <TextInput
          value={note}
          onChangeText={(t) => setNote(t.slice(0, MAX_NOTE_LENGTH))}
          placeholder="Say why."
          placeholderTextColor={colors.empty}
          multiline
          maxLength={MAX_NOTE_LENGTH}
          accessibilityLabel="Add a note"
          className="mt-2 font-sans text-[16px] leading-6 text-ink"
        />
        <View className="mt-2 flex-row justify-end">
          <Text className="font-sans text-[11px] text-muted">
            {MAX_NOTE_LENGTH - note.length} left
          </Text>
        </View>

        {post.error ? (
          <Text className="mt-4 font-sans text-[13px] leading-5" style={{ color: colors.accent }}>
            {post.error.message}
          </Text>
        ) : null}

        <View className="mt-8">
          <Button
            label="Leave your Kreami"
            loading={post.isPending}
            disabled={!canPost}
            onPress={submit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
