import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LoadError } from '@/components/load-error';
import { PersonRow } from '@/components/person-row';
import {
  useFollowList,
  usePublicProfile,
  type FollowListKind,
  type FollowRow,
} from '@/lib/profiles';
import { useGoBack } from '@/lib/navigation';
import { colors } from '@/theme/tokens';

const TABS: { key: FollowListKind; label: string }[] = [
  { key: 'followers', label: 'FOLLOWERS' },
  { key: 'following', label: 'FOLLOWING' },
];

/**
 * Followers and following for one person, yours included — there is no
 * separate route for your own, because unlike a profile this screen is a list
 * of *other* people and reads identically either way.
 *
 * Both tabs live behind one route so switching between them costs nothing and
 * keeps the back stack a single entry deep.
 */
export default function Follows() {
  const router = useRouter();
  const { handle, tab } = useLocalSearchParams<{ handle: string; tab?: string }>();
  // Arrived cold from a link, the place to land is the profile this list belongs to.
  const goBack = useGoBack({ pathname: '/u/[handle]', params: { handle } });
  const [kind, setKind] = useState<FollowListKind>(tab === 'following' ? 'following' : 'followers');

  // The param seeds the tab; switching writes it back, so on web a reload or a
  // shared link lands on the tab that was actually being looked at.
  const showTab = (next: FollowListKind) => {
    setKind(next);
    router.setParams({ tab: next });
  };

  const profile = usePublicProfile(handle);
  const list = useFollowList(kind, profile.data?.id);
  const people = list.data?.pages.flat() ?? [];

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center justify-between gap-4 px-6 pb-3 pt-5">
        <Pressable accessibilityRole="button" onPress={goBack} className="min-h-11 justify-center">
          <Text className="font-sans text-[15px] text-ink">Back</Text>
        </Pressable>
        <Text className="font-sans text-[10px] tracking-label text-muted" numberOfLines={1}>
          {profile.data ? `@${profile.data.handle}`.toUpperCase() : ''}
        </Text>
      </View>

      <View className="flex-row gap-6 border-b border-rule px-6">
        {TABS.map((t) => {
          const active = t.key === kind;
          const count =
            t.key === 'followers' ? profile.data?.follower_count : profile.data?.following_count;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => showTab(t.key)}
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
                {t.label}
                {count !== undefined ? ` ${count}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {profile.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : !profile.data ? (
        <NotFound onBack={() => router.replace('/')} />
      ) : list.isError ? (
        <View className="px-6">
          <LoadError error={list.error} onRetry={() => list.refetch()} />
        </View>
      ) : list.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(person: FollowRow) => person.id}
          renderItem={({ item }) => <PersonRow person={item} />}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => list.refetch()}
              tintColor={colors.muted}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
          }}
          ListEmptyComponent={<Empty kind={kind} isSelf={profile.data.is_self} />}
          ListFooterComponent={
            list.isFetchingNextPage ? (
              <ActivityIndicator className="py-6" color={colors.muted} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Four different sentences, because "No results" tells somebody nothing about
 * what to do next — and an empty Following tab of your own is the one case
 * where there is an obvious action.
 */
function Empty({ kind, isSelf }: { kind: FollowListKind; isSelf: boolean }) {
  const router = useRouter();

  const line =
    kind === 'followers'
      ? isSelf
        ? 'Nobody follows you yet. Rate a few things and they will.'
        : 'Nobody follows them yet.'
      : isSelf
        ? 'You are not following anyone yet.'
        : 'They are not following anyone yet.';

  return (
    <View className="py-10">
      <Text className="font-sans text-[15px] leading-6 text-body">{line}</Text>
      {isSelf && kind === 'following' ? (
        <View className="mt-5">
          <Button
            label="Find people"
            variant="secondary"
            onPress={() => router.push('/discover')}
          />
        </View>
      ) : null}
    </View>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <View className="px-6">
      <Text className="mt-8 font-serif text-[28px] text-ink">Not found</Text>
      <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
        There is nobody here by that name.
      </Text>
      <View className="mt-6">
        <Button label="Back" variant="secondary" onPress={onBack} />
      </View>
    </View>
  );
}
