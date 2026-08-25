import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { KreamRating } from '@/components/kream-rating';
import { LoadError } from '@/components/load-error';
import {
  averageOf,
  useDistribution,
  useExperienceBySlug,
  useThread,
  type KreamiWithAuthor,
  type ThreadSort,
} from '@/lib/experiences';
import { colors } from '@/theme/tokens';

const SORTS: { key: ThreadSort; label: string }[] = [
  { key: 'recent', label: 'RECENT' },
  { key: 'top', label: 'TOP' },
  { key: 'highest', label: 'HIGHEST' },
  { key: 'lowest', label: 'LOWEST' },
];

export default function ExperienceThread() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [sort, setSort] = useState<ThreadSort>('recent');

  const experience = useExperienceBySlug(slug);
  const thread = useThread(experience.data?.id, sort);
  const distribution = useDistribution(experience.data?.id);

  if (experience.isPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={colors.muted} />
      </SafeAreaView>
    );
  }

  if (!experience.data) {
    return (
      <SafeAreaView className="flex-1 bg-paper px-6">
        <Text className="mt-10 font-serif text-[28px] text-ink">Not found</Text>
        <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
          This experience does not exist, or it was hidden.
        </Text>
        <View className="mt-6">
          <Button label="Back" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const e = experience.data;
  const average = averageOf(e);
  const bars = distribution.data ?? [];
  const peak = Math.max(1, ...bars.map((b) => b.count));

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <ScrollView contentContainerClassName="pb-12">
        <View className="flex-row items-center justify-between px-6 pb-2 pt-5">
          <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-2">
            <Text className="font-sans text-[15px] text-ink">Back</Text>
          </Pressable>
        </View>

        <View className="px-6">
          <Text className="font-serif text-[32px] leading-10 text-ink">{e.title}</Text>

          <View className="mt-4 flex-row items-baseline gap-3">
            {average !== null ? (
              <>
                <KreamRating rating={Math.round(average)} size={17} showNumeral={false} />
                <Text className="font-serif text-[26px] leading-none text-ink">
                  {average.toFixed(1)}
                </Text>
                <Text className="font-sans text-[10px] tracking-label text-muted">
                  KREAMS · {e.kreami_count} {e.kreami_count === 1 ? 'KREAMI' : 'KREAMIS'}
                </Text>
              </>
            ) : (
              <Text className="font-sans text-[13px] text-muted">
                Not enough Kreamis for an average yet · {e.kreami_count}{' '}
                {e.kreami_count === 1 ? 'Kreami' : 'Kreamis'}
              </Text>
            )}
          </View>

          {/* Six bars, always. A missing bar reads as missing data, not as zero. */}
          <View className="mt-5 gap-2">
            {bars.map((bar) => (
              <View key={bar.rating} className="flex-row items-center gap-3">
                <Text className="w-2 font-sans text-[11px] text-muted">{bar.rating}</Text>
                <View className="h-[7px] flex-1" style={{ backgroundColor: colors.fill }}>
                  <View
                    style={{
                      width: `${(bar.count / peak) * 100}%`,
                      height: 7,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <Text className="w-5 text-right font-sans text-[11px] text-muted">{bar.count}</Text>
              </View>
            ))}
          </View>

          <View className="mt-6">
            <Button
              label="Leave a Kreami"
              onPress={() => router.push({ pathname: '/rate', params: { title: e.title } })}
            />
          </View>
        </View>

        <View className="mt-6 flex-row gap-6 border-b border-rule px-6">
          {SORTS.map((s) => {
            const active = s.key === sort;
            return (
              <Pressable
                key={s.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setSort(s.key)}
                className="pb-3"
                style={active ? { borderBottomWidth: 1.5, borderColor: colors.ink } : undefined}
              >
                <Text
                  className="font-sans text-[11px] tracking-tab"
                  style={{
                    color: active ? colors.ink : colors.muted,
                    fontFamily: active ? 'Archivo_600SemiBold' : 'Archivo_500Medium',
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View className="px-6">
          {thread.isError ? (
            <LoadError error={thread.error} onRetry={() => thread.refetch()} />
          ) : thread.isPending ? (
            <ActivityIndicator className="mt-8" color={colors.muted} />
          ) : thread.data?.length === 0 ? (
            <Text className="mt-8 font-sans text-[15px] leading-6 text-body">
              No Kreamis yet. Be first.
            </Text>
          ) : (
            thread.data?.map((k) => <ThreadRow key={k.id} kreami={k} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ThreadRow({ kreami }: { kreami: KreamiWithAuthor }) {
  const author = kreami.profiles;
  return (
    <View className="border-b border-rule py-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5 rounded-full" style={{ backgroundColor: colors.fill }} />
          <Text className="font-sans text-[10px] tracking-tab text-ink">
            {(author?.handle ?? author?.display_name ?? 'someone').toUpperCase()}
          </Text>
        </View>
        <KreamRating rating={kreami.rating} size={14} numeralSize={17} />
      </View>
      {kreami.note ? (
        <Text className="mt-3 font-sans text-[15px] leading-6 text-body">{kreami.note}</Text>
      ) : null}
    </View>
  );
}
