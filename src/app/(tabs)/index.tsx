import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { KreamiCard } from '@/components/kreami-card';
import { useProfile } from '@/lib/auth';
import { useGlobalFeed, useHomeFeed, useToggleLike, type FeedItem } from '@/lib/feed';
import { colors } from '@/theme/tokens';

/**
 * The following feed.
 *
 * It must never render blank. A new account follows nobody, and an empty
 * screen at that moment is where most social apps lose people — so when the
 * following feed is thin we fall through to the global feed rather than
 * showing an empty state. See docs/06-feeds-and-social.md.
 */
export default function Home() {
  const profile = useProfile();
  const home = useHomeFeed();
  const toggleLike = useToggleLike();

  const homeItems = home.data?.pages.flat() ?? [];
  const thin = !home.isPending && homeItems.length < 5;

  // Only fetched when the following feed cannot carry the screen on its own.
  const global = useGlobalFeed(thin);
  const globalItems = (global.data?.pages.flat() ?? []).filter(
    (g) => !homeItems.some((h) => h.kreami_id === g.kreami_id),
  );

  const following = profile.data?.following_count ?? 0;

  return (
    <SafeAreaView
      className="flex-1 bg-paper"
      style={{ backgroundColor: colors.paper }}
      edges={['top']}
    >
      <View className="flex-row items-baseline justify-between px-6 pb-3 pt-4">
        <Text className="font-serif text-[30px] leading-none text-ink">Kreami</Text>
        <Text className="font-sans text-[10px] tracking-label text-muted">
          {following > 0 ? 'FOLLOWING' : 'EVERYONE'}
        </Text>
      </View>
      <View className="mx-6 h-px bg-ink" />

      {home.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : (
        <FlatList
          data={[...homeItems, ...(thin ? globalItems : [])]}
          keyExtractor={(item: FeedItem) => item.kreami_id}
          renderItem={({ item }) => (
            <KreamiCard item={item} onToggleLike={(id) => toggleLike.mutate(id)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={home.isRefetching}
              onRefresh={() => {
                home.refetch();
                if (thin) global.refetch();
              }}
              tintColor={colors.muted}
            />
          }
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (thin) {
              if (global.hasNextPage && !global.isFetchingNextPage) global.fetchNextPage();
            } else if (home.hasNextPage && !home.isFetchingNextPage) {
              home.fetchNextPage();
            }
          }}
          ListHeaderComponent={
            thin ? <ThinFeedNotice hasAny={homeItems.length > 0} following={following} /> : null
          }
          ListEmptyComponent={<NothingYet />}
          ListFooterComponent={
            home.isFetchingNextPage || global.isFetchingNextPage ? (
              <ActivityIndicator className="py-6" color={colors.muted} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

function ThinFeedNotice({ hasAny, following }: { hasAny: boolean; following: number }) {
  const router = useRouter();
  return (
    <View className="border-b border-rule py-6">
      <Text className="font-sans text-[10px] tracking-label text-muted">
        {following > 0 ? 'AND WHAT EVERYONE ELSE IS RATING' : 'WHAT EVERYONE IS RATING'}
      </Text>
      <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
        {hasAny
          ? 'Follow a few people and this becomes your own feed.'
          : 'Follow people to build your feed. Meanwhile, here is everyone.'}
      </Text>
      <View className="mt-4">
        <Button label="Find people" variant="secondary" onPress={() => router.push('/discover')} />
      </View>
    </View>
  );
}

function NothingYet() {
  const router = useRouter();
  return (
    <View className="py-10">
      <Text className="font-serif text-[26px] leading-8 text-ink">Nothing here yet</Text>
      <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
        Nobody has rated anything. That makes you first.
      </Text>
      <View className="mt-5">
        <Button label="Leave a Kreami" onPress={() => router.push('/compose')} />
      </View>
    </View>
  );
}
