import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Kream } from '@/components/kream-rating';
import {
  MAX_TITLE_LENGTH,
  normalizeExperienceTitle,
  useSearchExperiences,
  type ExperienceMatch,
} from '@/lib/experiences';
import { colors } from '@/theme/tokens';

/**
 * Step 1 of 2: what did you experience.
 *
 * The results list is the entire deduplication strategy. Under the exact-match
 * rule nothing downstream catches a near-duplicate, so this list has to be
 * fast, generous and impossible to miss. Each row carries its average and
 * count because that social proof is what makes tapping more attractive than
 * typing. See docs/05-experience-matching.md.
 */
export default function Compose() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(title), 250);
    return () => clearTimeout(t);
  }, [title]);

  const results = useSearchExperiences(debounced);
  const normalized = normalizeExperienceTitle(title);
  const canContinue = normalized.length >= 2;

  function go(withTitle: string) {
    router.push({ pathname: '/rate', params: { title: withTitle } });
  }

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-5">
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-2">
          <Text className="font-sans text-[15px] text-muted">Cancel</Text>
        </Pressable>
        <Text className="font-sans text-[10px] tracking-label text-muted">1 OF 2</Text>
        <Pressable
          accessibilityRole="button"
          disabled={!canContinue}
          onPress={() => go(title)}
          className="py-2"
        >
          <Text
            className="font-sans-semibold text-[15px]"
            style={{ color: canContinue ? colors.accent : colors.empty }}
          >
            Next
          </Text>
        </Pressable>
      </View>

      <View className="px-6">
        <Text className="font-sans text-[10px] tracking-label text-muted">
          WHAT DID YOU EXPERIENCE?
        </Text>
        <TextInput
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE_LENGTH))}
          placeholder="Eating a candy apple"
          placeholderTextColor={colors.empty}
          autoFocus
          multiline
          maxLength={MAX_TITLE_LENGTH}
          accessibilityLabel="What did you experience?"
          className="mt-3 font-serif text-[28px] leading-9 text-ink"
          onSubmitEditing={() => canContinue && go(title)}
        />
        <View className="mt-2 flex-row justify-end">
          <Text className="font-sans text-[11px] text-muted">
            {MAX_TITLE_LENGTH - title.length} left
          </Text>
        </View>
      </View>

      <View className="mx-6 mt-3 h-px bg-ink" />

      <ScrollView contentContainerClassName="px-6 pb-10" keyboardShouldPersistTaps="handled">
        {results.isFetching ? (
          <View className="flex-row items-center gap-3 py-5">
            <ActivityIndicator color={colors.muted} size="small" />
            <Text className="font-sans text-[13px] text-muted">Looking…</Text>
          </View>
        ) : null}

        {results.data && results.data.length > 0 ? (
          <>
            <Text className="py-5 font-sans text-[10px] tracking-label text-muted">
              ALREADY BEING RATED
            </Text>
            {results.data.map((match) => (
              <MatchRow key={match.id} match={match} onPress={() => go(match.title)} />
            ))}
          </>
        ) : null}

        {debounced.length >= 2 && !results.isFetching && results.data?.length === 0 ? (
          <Text className="py-6 font-sans text-[13px] leading-5 text-muted">
            Nobody has rated that yet. Be first.
          </Text>
        ) : null}

        {results.data && results.data.length > 0 ? (
          <Text className="py-5 font-sans text-[13px] leading-5 text-muted">
            Not one of these? Keep typing — Next starts a new one.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MatchRow({ match, onPress }: { match: ExperienceMatch; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${match.title}, ${match.kreami_count} Kreamis`}
      onPress={onPress}
      className="flex-row items-center justify-between gap-3 border-b border-rule py-4 active:bg-fill"
    >
      <View className="flex-1">
        <Text className="font-serif text-[21px] leading-6 text-ink">{match.title}</Text>
        <View className="mt-2 flex-row items-center gap-2">
          <View className="flex-row items-center gap-[3px]">
            {Array.from({ length: 5 }, (_, i) => (
              <Kream key={i} size={12} filled={i < Math.round(match.avg_kreams ?? 0)} />
            ))}
          </View>
          <Text className="font-sans text-[10px] tracking-meta text-muted">
            {match.avg_kreams !== null ? `${match.avg_kreams.toFixed(1)} · ` : ''}
            {match.kreami_count} {match.kreami_count === 1 ? 'KREAMI' : 'KREAMIS'}
          </Text>
        </View>
      </View>
      <Text className="font-sans text-[16px] text-empty">›</Text>
    </Pressable>
  );
}
