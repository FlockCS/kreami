import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { KreamRating } from '@/components/kream-rating';
import { since } from '@/components/kreami-card';
import { LoadError } from '@/components/load-error';
import { useToggleFollow } from '@/lib/feed';
import {
  useProfileKreamis,
  type FollowListKind,
  type ProfileKreami,
  type ProfileSort,
  type PublicProfile,
} from '@/lib/profiles';
import { colors } from '@/theme/tokens';

const SORTS: { key: ProfileSort; label: string }[] = [
  { key: 'recent', label: 'RECENT' },
  { key: 'highest', label: 'HIGHEST' },
  { key: 'lowest', label: 'LOWEST' },
];

/**
 * One profile body, used for both your own and somebody else's. The only
 * difference is the action: an outlined Edit on your own, a filled Follow on
 * theirs. One filled button per screen, so the primary action is never
 * ambiguous. See docs/08-ux-flows.md.
 */
export function ProfileView({
  profile,
  action,
}: {
  profile: PublicProfile;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<ProfileSort>('recent');
  const kreamis = useProfileKreamis(profile.id, sort);
  const follow = useToggleFollow();

  // Both tabs of the same screen, including for your own profile: a list of
  // other people reads the same whoever is looking at it.
  const openFollows = (tab: FollowListKind) =>
    router.push({
      pathname: '/u/[handle]/follows',
      params: { handle: profile.handle, tab },
    });

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="px-6">
        <View className="flex-row items-center gap-4">
          <View className="h-16 w-16 rounded-full" style={{ backgroundColor: colors.fill }} />
          <View className="flex-1">
            <Text className="font-serif text-[30px] leading-9 text-ink">
              {profile.display_name}
            </Text>
            <Text className="mt-1 font-sans text-[13px] text-muted">@{profile.handle}</Text>
          </View>
        </View>

        {profile.bio ? (
          <Text className="mt-4 font-sans text-[15px] leading-6 text-body">{profile.bio}</Text>
        ) : null}

        <View className="mt-5 flex-row items-baseline gap-6">
          <Stat value={profile.kreami_count} label="KREAMIS" />
          <Stat
            value={profile.follower_count}
            label="FOLLOWERS"
            onPress={() => openFollows('followers')}
          />
          <Stat
            value={profile.following_count}
            label="FOLLOWING"
            onPress={() => openFollows('following')}
          />
        </View>

        <View
          className="mt-5 flex-row items-center justify-between py-4"
          style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.rule }}
        >
          <Text className="font-sans text-[10px] tracking-label text-muted">
            AVERAGE KREAM GIVEN
          </Text>
          <Text
            className="font-serif text-[26px] leading-none"
            style={{ color: (profile.avg_kream_given ?? 3) < 2.5 ? colors.accent : colors.ink }}
          >
            {profile.avg_kream_given !== null ? profile.avg_kream_given.toFixed(1) : '—'}
          </Text>
        </View>

        <View className="mt-5">
          {action ?? (
            <Button
              label={profile.is_following ? 'Following' : 'Follow'}
              variant={profile.is_following ? 'secondary' : 'primary'}
              loading={follow.isPending}
              onPress={() => follow.mutate(profile.id)}
            />
          )}
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
        {kreamis.isError ? (
          <LoadError error={kreamis.error} onRetry={() => kreamis.refetch()} />
        ) : kreamis.isPending ? (
          <ActivityIndicator className="mt-8" color={colors.muted} />
        ) : kreamis.data?.length === 0 ? (
          <Text className="mt-8 font-sans text-[15px] leading-6 text-body">No Kreamis yet.</Text>
        ) : (
          kreamis.data?.map((k) => <ProfileKreamiRow key={k.kreami_id} kreami={k} />)
        )}
      </View>
    </ScrollView>
  );
}

/**
 * A profile number. The Kreami count has nowhere to go — the list is already
 * below it — so it stays inert; the two follow counts are the links into the
 * follower and following lists.
 */
function Stat({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  const body = (
    <>
      <Text className="font-serif text-[22px] leading-none text-ink">{value.toLocaleString()}</Text>
      <Text className="font-sans text-[10px] tracking-tab text-muted">{label}</Text>
    </>
  );

  if (!onPress) return <View className="flex-row items-baseline gap-[6px]">{body}</View>;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${value} ${label.toLowerCase()}`}
      onPress={onPress}
      className="flex-row items-baseline gap-[6px] py-1"
    >
      {body}
    </Pressable>
  );
}

function ProfileKreamiRow({ kreami }: { kreami: ProfileKreami }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={kreami.experience_title}
      onPress={() =>
        router.push({ pathname: '/e/[slug]', params: { slug: kreami.experience_slug } })
      }
      className="border-b border-rule py-4 active:bg-fill"
    >
      <View className="flex-row items-baseline justify-between gap-4">
        <Text className="flex-1 font-serif text-[21px] leading-7 text-ink">
          {kreami.experience_title}
        </Text>
        <KreamRating rating={kreami.rating} size={13} numeralSize={16} />
      </View>
      {kreami.note ? (
        <Text className="mt-2 font-sans text-[14px] leading-6 text-body">{kreami.note}</Text>
      ) : null}
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="font-sans text-[11px] text-muted">
          {kreami.like_count} likes · {since(kreami.created_at)}
        </Text>
        <Text className="font-sans text-[10px] tracking-meta text-muted">
          {kreami.experience_avg !== null ? `${kreami.experience_avg.toFixed(1)} AVG · ` : ''}
          {kreami.experience_kreami_count}{' '}
          {kreami.experience_kreami_count === 1 ? 'KREAMI' : 'KREAMIS'} ›
        </Text>
      </View>
    </Pressable>
  );
}
