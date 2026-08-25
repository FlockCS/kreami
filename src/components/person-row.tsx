import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useToggleFollow } from '@/lib/feed';
import { useOpenProfile, type FollowRow } from '@/lib/profiles';
import { colors } from '@/theme/tokens';

/**
 * One person in a list. The whole row opens their profile; the pill is the
 * only thing inside it that does something else, so it sits hard right with
 * its own hit area.
 *
 * Follow state comes from the row itself rather than a per-row query: the
 * list functions compute `is_following` for the viewer in the same pass, so
 * thirty rows cost one request, not thirty-one.
 */
export function PersonRow({ person }: { person: FollowRow }) {
  const openProfile = useOpenProfile();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${person.display_name}, @${person.handle}`}
      onPress={() => openProfile(person.handle)}
      className="flex-row items-start gap-3 border-b border-rule py-4 active:bg-fill"
    >
      <View className="mt-[2px] h-10 w-10 rounded-full" style={{ backgroundColor: colors.fill }} />

      <View className="flex-1">
        <Text className="font-serif text-[21px] leading-7 text-ink" numberOfLines={1}>
          {person.display_name}
        </Text>
        {/*
          One line, always. Letter-spaced small caps wrap badly, and "0
          FOLLOWERS" is a fact nobody needs printed next to a name — so the
          count appears only once there is one.
        */}
        <Text className="mt-[2px] font-sans text-[10px] tracking-meta text-muted" numberOfLines={1}>
          @{person.handle}
          {person.follower_count > 0
            ? ` · ${person.follower_count} ${person.follower_count === 1 ? 'FOLLOWER' : 'FOLLOWERS'}`
            : ''}
        </Text>
        {person.bio ? (
          <Text className="mt-2 font-sans text-[14px] leading-5 text-body" numberOfLines={2}>
            {person.bio}
          </Text>
        ) : null}
      </View>

      {/* Nobody needs a Follow button pointed at themselves. */}
      {person.is_self ? null : <FollowPill person={person} />}
    </Pressable>
  );
}

/**
 * The row-sized follow control. Deliberately not the shared Button: that one
 * is 56px tall and full width, which is right for the one primary action on a
 * screen and wrong thirty times down a list.
 */
function FollowPill({ person }: { person: FollowRow }) {
  const follow = useToggleFollow();
  const following = person.is_following;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${person.display_name}`}
      accessibilityState={{ selected: following, busy: follow.isPending }}
      disabled={follow.isPending}
      onPress={() => follow.mutate(person.id)}
      className={`h-9 min-w-[92px] flex-row items-center justify-center px-4 ${
        following ? 'border border-ink active:bg-fill' : 'bg-accent active:bg-accent-press'
      }`}
    >
      {follow.isPending ? (
        <ActivityIndicator size="small" color={following ? colors.ink : colors.paper} />
      ) : (
        <Text className={`font-sans-semibold text-[13px] ${following ? 'text-ink' : 'text-paper'}`}>
          {following ? 'Following' : 'Follow'}
        </Text>
      )}
    </Pressable>
  );
}
