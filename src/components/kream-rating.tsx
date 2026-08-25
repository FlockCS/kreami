import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, KREAM_MAX, KREAM_MIN } from '@/theme/tokens';

/**
 * The Kream scale. Six discrete values, 0 through 5, no halves.
 *
 * Two rules from docs/08 are enforced here rather than left to callers:
 *
 * 1. The numeral is ALWAYS rendered beside the glyphs. Five empty dollops on
 *    their own read as "nobody has rated this", which is exactly wrong when
 *    someone has deliberately given the harshest verdict in the app. At 0 the
 *    numeral is set in the accent colour so it reads as a verdict.
 * 2. Filled and unfilled differ in shape, not only colour — solid versus
 *    outline — so the rating survives greyscale and colour blindness.
 */

/** The dollop. Identical to the mark in design/screens/*.dc.html. */
const DOLLOP =
  'M12 2.6c1.2 2.5 2.6 3.7 4.4 5.1 2.2 1.7 3.6 3.6 3.6 6.2 0 3.7-3.6 6.6-8 6.6s-8-2.9-8-6.6c0-2.6 1.4-4.5 3.6-6.2C9.4 6.3 10.8 5.1 12 2.6z';

export function Kream({ size = 16, filled }: { size?: number; filled: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={DOLLOP}
        fill={filled ? colors.accent : 'none'}
        stroke={filled ? undefined : colors.empty}
        strokeWidth={filled ? undefined : 1.4}
      />
    </Svg>
  );
}

type DisplayProps = {
  rating: number;
  size?: number;
  /** Show "KREAMS" after the numeral. Off inside dense lists. */
  showLabel?: boolean;
  numeralSize?: number;
  /**
   * Hides the x/5 numeral. Legitimate ONLY where another numeral already sits
   * beside the glyphs — the experience header, where the average is shown. Never
   * turn this off on an individual Kreami: rule 1 above is the whole reason 0/5
   * is legible.
   */
  showNumeral?: boolean;
};

export function KreamRating({
  rating,
  size = 16,
  showLabel = false,
  numeralSize = 21,
  showNumeral = true,
}: DisplayProps) {
  const zero = rating === KREAM_MIN;

  return (
    <View
      className="flex-row items-baseline gap-3"
      accessibilityRole="text"
      accessibilityLabel={`Rated ${rating} out of ${KREAM_MAX} Kreams`}
    >
      <View
        className="flex-row items-center gap-1"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: KREAM_MAX }, (_, i) => (
          <Kream key={i} size={size} filled={i < rating} />
        ))}
      </View>
      {showNumeral ? (
        <Text
          className="font-serif leading-none"
          style={{ fontSize: numeralSize, color: zero ? colors.accent : colors.ink }}
        >
          {rating}/{KREAM_MAX}
        </Text>
      ) : null}
      {showLabel ? (
        <Text
          className="font-sans text-[10px] tracking-label"
          style={{ color: zero ? colors.accent : colors.muted }}
        >
          KREAMS
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Six tap targets, 48pt each. Deliberately not a slider: a slider implies a
 * continuous scale, and the whole premise is six discrete values.
 */
export function KreamPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      {Array.from({ length: KREAM_MAX - KREAM_MIN + 1 }, (_, i) => i + KREAM_MIN).map((n) => {
        const selected = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`Rate ${n} out of ${KREAM_MAX} Kreams`}
            onPress={() => onChange(n)}
            className={`h-12 w-12 items-center justify-center rounded-full border ${
              selected ? 'border-accent bg-accent' : 'border-empty active:bg-fill'
            }`}
          >
            <Text
              className="font-serif text-[20px] leading-none"
              style={{ color: selected ? colors.paper : colors.ink }}
            >
              {n}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
