import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { since } from '@/components/kreami-card';
import { LoadError } from '@/components/load-error';
import { useActivityFeed, useMarkAllRead, type ActivityItem } from '@/lib/notifications';
import { useOpenProfile } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

/**
 * Everything that happened to you. In-app only — there is no push (BACKLOG),
 * so this screen is the whole of what Kreami ever tells anybody.
 */
export default function Activity() {
  const activity = useActivityFeed();
  const markRead = useMarkAllRead();
  const items = activity.data?.pages.flat() ?? [];

  // Opening the tab is what "seen" means, so the badge clears on arrival
  // rather than waiting for a scroll or a tap. Once per mount: the mutation
  // is idempotent, but re-running it on every render would be a request per
  // render.
  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView
      className="flex-1 bg-paper"
      style={{ backgroundColor: colors.paper }}
      edges={['top']}
    >
      <View className="flex-row items-baseline justify-between px-6 pb-3 pt-4">
        <Text className="font-serif text-[30px] leading-none text-ink">Activity</Text>
      </View>
      <View className="mx-6 h-px bg-ink" />

      {activity.isError ? (
        <View className="px-6">
          <LoadError error={activity.error} onRetry={() => activity.refetch()} />
        </View>
      ) : activity.isPending ? (
        <ActivityIndicator className="mt-10" color={colors.muted} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: ActivityItem) => item.id}
          renderItem={({ item }) => <ActivityRow item={item} />}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={activity.isRefetching}
              onRefresh={() => activity.refetch()}
              tintColor={colors.muted}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (activity.hasNextPage && !activity.isFetchingNextPage) activity.fetchNextPage();
          }}
          ListEmptyComponent={<NothingYet />}
          ListFooterComponent={
            activity.isFetchingNextPage ? (
              <ActivityIndicator className="py-6" color={colors.muted} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

/**
 * One line of news.
 *
 * Every kind reads as a sentence about a person and a thing, so the row is
 * always: who, what they did, and where it happened. Tapping goes to the
 * where — the experience thread — except for a follow, which has no thread and
 * goes to the person instead.
 */
function ActivityRow({ item }: { item: ActivityItem }) {
  const router = useRouter();
  const openProfile = useOpenProfile();

  // A deleted account leaves its notifications behind rather than punching
  // holes in somebody's history, so the actor may be gone.
  const actor = item.actor_display_name ?? 'Somebody';

  const open = () => {
    if (item.kind === 'new_follower') openProfile(item.actor_handle);
    else if (item.experience_slug)
      router.push({ pathname: '/e/[slug]', params: { slug: item.experience_slug } });
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${actor} ${describe(item)}`}
      onPress={open}
      className="flex-row items-start gap-3 border-b border-rule py-4 active:bg-fill"
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${actor}'s profile`}
        onPress={() => openProfile(item.actor_handle)}
        className="mt-[2px]"
      >
        <Avatar url={item.actor_avatar_url} size={36} name={actor} />
      </Pressable>

      <View className="flex-1">
        <Text className="font-sans text-[15px] leading-6 text-body">
          <Text className="font-sans-semibold text-ink">{actor}</Text> {describe(item)}
        </Text>

        {item.experience_title ? (
          <Text className="mt-1 font-serif text-[18px] leading-6 text-ink" numberOfLines={2}>
            {item.experience_title}
          </Text>
        ) : null}

        <Text className="mt-1 font-sans text-[10px] tracking-meta text-muted">
          {since(item.created_at)}
        </Text>
      </View>

      {/* The unread mark stays after the badge clears, so a visit can still
          show what arrived since the last one. */}
      {item.read_at ? null : (
        <View
          className="mt-[10px] h-2 w-2 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      )}
    </Pressable>
  );
}

function describe(item: ActivityItem): string {
  switch (item.kind) {
    case 'new_follower':
      return 'followed you.';
    case 'kreami_liked':
      return 'liked your Kreami on';
    case 'experience_activity':
      return 'also rated';
    case 'kreami_replied':
      // Unreachable: replies are cut from v1 (D18) and nothing generates this.
      return 'replied to your Kreami on';
  }
}

function NothingYet() {
  const router = useRouter();
  return (
    <View className="py-10">
      <Text className="font-serif text-[26px] leading-8 text-ink">Nothing yet</Text>
      <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
        Kreamis you leave will show up here when people react to them.
      </Text>
      <View className="mt-5">
        <Button label="Leave a Kreami" onPress={() => router.push('/compose')} />
      </View>
    </View>
  );
}
