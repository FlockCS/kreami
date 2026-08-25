import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * The person glyph. Shared with the You tab, so the fallback avatar and the
 * tab that leads to it are the same drawing rather than two that nearly match.
 */
export function PersonGlyph({ color, size = 22 }: { color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8.5} r={3.5} stroke={color} strokeWidth={1.6} />
      <Path
        d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Somebody's photo, or the person glyph when they have none.
 *
 * A blank filled circle — which is what every avatar in the app used to be —
 * reads as "still loading" rather than "no photo". The glyph says the absence
 * is settled.
 *
 * "None" includes a photo that will not load. Sign-in with Google stores a
 * lh3.googleusercontent.com URL, and browsers that block Google-owned hosts —
 * Brave does by default — fail that request: `fetch` returns the bytes, an
 * `<img>` does not render. Without the fallback below that produced the exact
 * blank circle the glyph exists to prevent, and only for people who signed in
 * with Google, which is most of them.
 */
export function Avatar({
  url,
  size,
  name,
}: {
  url: string | null | undefined;
  size: number;
  name?: string;
}) {
  // Which url failed, rather than whether one did. Rows are recycled as a list
  // scrolls, so a boolean would condemn whoever landed in the row next; storing
  // the url means a new one is simply a different value and gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showPhoto = Boolean(url) && url !== failedUrl;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.fill,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {showPhoto ? (
        <Image
          source={url}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          onError={() => setFailedUrl(url ?? null)}
          accessibilityLabel={name ? `${name}'s photo` : 'Profile photo'}
        />
      ) : (
        // 0.58 keeps the glyph optically centred inside the circle at every
        // size the app uses — 20px in a feed, 64px on a profile.
        <PersonGlyph color={colors.empty} size={Math.round(size * 0.58)} />
      )}
    </View>
  );
}
