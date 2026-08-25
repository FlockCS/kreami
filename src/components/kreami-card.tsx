import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { KreamRating } from '@/components/kream-rating';
import type { FeedItem } from '@/lib/feed';
import { colors } from '@/theme/tokens';

/** Compact relative time. Feeds are scanned, not read. */
export function since(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'NOW';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}M`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}H`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}D`;
  const weeks = days / 7;
  if (weeks < 52) return `${Math.floor(weeks)}W`;
  return `${Math.floor(days / 365)}Y`;
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9z"
        fill={filled ? colors.accent : 'none'}
        stroke={filled ? colors.accent : colors.muted}
        strokeWidth={1.6}
      />
    </Svg>
  );
}

function ReplyArrow() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path
        d="M9 17l-5-5 5-5"
        fill="none"
        stroke={colors.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 12h11a5 5 0 0 1 5 5v1"
        fill="none"
        stroke={colors.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * One Kreami in a feed.
 *
 * The experience's average and count sit in the corner as a tappable
 * affordance into the thread. That is the mechanism that turns a passive feed
 * reader into a thread participant, and it is worth the visual clutter — see
 * docs/08-ux-flows.md.
 */
export function KreamiCard({
  item,
  onToggleLike,
}: {
  item: FeedItem;
  onToggleLike?: (kreamiId: string) => void;
}) {
  const router = useRouter();
  const author = item.handle ?? item.display_name;

  return (
    <View className="border-b border-rule py-6">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${item.display_name}'s profile`}
        onPress={() =>
          item.handle && router.push({ pathname: '/u/[handle]', params: { handle: item.handle } })
        }
        className="flex-row items-center gap-2"
      >
        <View className="h-5 w-5 rounded-full" style={{ backgroundColor: colors.fill }} />
        <Text className="font-sans text-[10px] tracking-tab text-ink">{author.toUpperCase()}</Text>
        <Text className="font-sans text-[10px] tracking-tab text-muted">·</Text>
        <Text className="font-sans text-[10px] tracking-tab text-muted">
          {since(item.created_at)}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.experience_title}
        onPress={() =>
          router.push({ pathname: '/e/[slug]', params: { slug: item.experience_slug } })
        }
      >
        <Text className="mt-3 font-serif text-[26px] leading-8 text-ink">
          {item.experience_title}
        </Text>
      </Pressable>

      <View className="mt-3">
        <KreamRating rating={item.rating} size={16} showLabel />
      </View>

      {item.note ? (
        <Text className="mt-3 font-sans text-[15px] leading-6 text-body">{item.note}</Text>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.liked_by_me ? 'Unlike' : 'Like'}
            accessibilityState={{ selected: item.liked_by_me }}
            onPress={() => onToggleLike?.(item.kreami_id)}
            disabled={!onToggleLike}
            className="min-h-11 flex-row items-center gap-[6px] pr-2"
          >
            <Heart filled={item.liked_by_me} />
            <Text
              className="font-sans text-[12px]"
              style={{ color: item.liked_by_me ? colors.accent : colors.muted }}
            >
              {item.like_count}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.reply_count} replies`}
            onPress={() =>
              router.push({ pathname: '/e/[slug]', params: { slug: item.experience_slug } })
            }
            className="min-h-11 flex-row items-center gap-[6px] pr-2"
          >
            <ReplyArrow />
            <Text className="font-sans text-[12px] text-muted">{item.reply_count}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${item.experience_kreami_count} Kreamis on this experience`}
          onPress={() =>
            router.push({ pathname: '/e/[slug]', params: { slug: item.experience_slug } })
          }
          className="min-h-11 flex-row items-center gap-[6px]"
        >
          <Text className="font-sans text-[10px] tracking-meta text-muted">
            {item.experience_avg !== null ? `${item.experience_avg.toFixed(1)} AVG · ` : ''}
            {item.experience_kreami_count}{' '}
            {item.experience_kreami_count === 1 ? 'KREAMI' : 'KREAMIS'}
          </Text>
          <Text className="font-sans text-[13px] text-muted">›</Text>
        </Pressable>
      </View>
    </View>
  );
}
