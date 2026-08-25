import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Kream } from '@/components/kream-rating';
import { LoadError } from '@/components/load-error';
import { PersonRow } from '@/components/person-row';
import { useSession } from '@/lib/auth';
import { useSearchExperiences } from '@/lib/experiences';
import { useActiveExperiences } from '@/lib/feed';
import { useSearchProfiles, useSuggestedProfiles } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

/**
 * Discovery is the answer to cold start, and it is open to logged-out
 * visitors on purpose — that is the top of the funnel. See docs/06.
 */
export default function Discover() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { session } = useSession();
  const experiences = useSearchExperiences(debounced);
  const people = useSearchProfiles(debounced);
  const active = useActiveExperiences();
  // Only worth showing to somebody who could act on it, and only when they
  // are not already searching for a specific person.
  const suggestions = useSuggestedProfiles(Boolean(session) && !debounced.trim());

  const searching = debounced.trim().length >= 2;

  return (
    <SafeAreaView
      className="flex-1 bg-paper"
      style={{ backgroundColor: colors.paper }}
      edges={['top']}
    >
      <View className="px-6 pb-3 pt-4">
        <Text className="font-serif text-[30px] leading-none text-ink">Discover</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search experiences and people"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search experiences and people"
          className="mt-4 border-b border-ink pb-2 font-sans text-[16px] text-ink"
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        {searching ? (
          <>
            {people.data && people.data.length > 0 ? (
              <>
                <Text className="py-4 font-sans text-[10px] tracking-label text-muted">PEOPLE</Text>
                {people.data.map((person) => (
                  <PersonRow key={person.id} person={person} />
                ))}
              </>
            ) : null}

            <Text className="py-4 font-sans text-[10px] tracking-label text-muted">
              EXPERIENCES
            </Text>
            {experiences.isError ? (
              <LoadError error={experiences.error} onRetry={() => experiences.refetch()} />
            ) : experiences.isFetching ? (
              <ActivityIndicator className="py-4" color={colors.muted} />
            ) : experiences.data?.length ? (
              experiences.data.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  avg={e.avg_kreams}
                  count={e.kreami_count}
                  onPress={() => router.push({ pathname: '/e/[slug]', params: { slug: e.slug } })}
                />
              ))
            ) : (
              <View className="py-4">
                <Text className="font-sans text-[15px] leading-6 text-body">
                  Nobody has rated that yet. Be first.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/rate', params: { title: query.trim() } })
                  }
                  className="mt-3 min-h-11 justify-center"
                >
                  <Text className="font-sans text-[14px] text-ink underline">
                    Rate “{query.trim()}”
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <>
            {suggestions.data && suggestions.data.length > 0 ? (
              <>
                <Text className="py-4 font-sans text-[10px] tracking-label text-muted">
                  PEOPLE TO FOLLOW
                </Text>
                {suggestions.data.map((person) => (
                  <PersonRow key={person.id} person={person} reason={person.reason} />
                ))}
              </>
            ) : null}

            <Text className="py-4 font-sans text-[10px] tracking-label text-muted">
              BEING RATED THIS WEEK
            </Text>
            {active.isError ? (
              <LoadError error={active.error} onRetry={() => active.refetch()} />
            ) : active.isPending ? (
              <ActivityIndicator className="py-4" color={colors.muted} />
            ) : active.data?.length ? (
              active.data.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  avg={e.avg_kreams}
                  count={e.kreami_count}
                  onPress={() => router.push({ pathname: '/e/[slug]', params: { slug: e.slug } })}
                />
              ))
            ) : (
              <Text className="py-4 font-sans text-[15px] leading-6 text-body">
                Nothing has been rated yet.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  title,
  avg,
  count,
  onPress,
}: {
  title: string;
  avg: number | null;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${count} Kreamis`}
      onPress={onPress}
      className="flex-row items-center justify-between gap-3 border-b border-rule py-4 active:bg-fill"
    >
      <View className="flex-1">
        <Text className="font-serif text-[21px] leading-7 text-ink">{title}</Text>
        <View className="mt-2 flex-row items-center gap-2">
          <View className="flex-row items-center gap-[3px]">
            {Array.from({ length: 5 }, (_, i) => (
              <Kream key={i} size={12} filled={i < Math.round(avg ?? 0)} />
            ))}
          </View>
          <Text className="font-sans text-[10px] tracking-meta text-muted">
            {avg !== null ? `${avg.toFixed(1)} · ` : ''}
            {count} {count === 1 ? 'KREAMI' : 'KREAMIS'}
          </Text>
        </View>
      </View>
      <Text className="font-sans text-[16px] text-empty">›</Text>
    </Pressable>
  );
}
