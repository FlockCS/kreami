import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Google sign-in button.
 *
 * The label is one of Google's three sanctioned strings ("Sign in with Google",
 * "Sign up with Google", "Continue with Google"). Shortening it to just
 * "Google" is outside their identity guidelines and can be flagged during Play
 * Store review or OAuth verification.
 *
 * Deliberately not a variant of `Button`: its colours, border and mark are
 * Google's, not ours, and entangling them with the design system would invite
 * someone to "fix" it to match the palette later. The values below are from
 * Google's identity guidelines for the light theme, so they stay as literals
 * rather than moving into theme/tokens.ts.
 */

const GOOGLE = {
  surface: '#FFFFFF',
  surfacePressed: '#F2F2F2',
  border: '#747775',
  text: '#1F1F1F',
} as const;

/** The official four-colour G, on Google's 48x48 grid. */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityRole="image">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label?: string;
  loading?: boolean;
};

export function GoogleButton({ label = 'Sign in with Google', loading, disabled, ...rest }: Props) {
  const inert = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: Boolean(loading) }}
      disabled={inert}
      // NativeWind swallows Pressable's function `style` when `className` is
      // present (see docs/08), so this button uses `style` only.
      style={({ pressed }) => ({
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: pressed ? GOOGLE.surfacePressed : GOOGLE.surface,
        borderWidth: 1,
        borderColor: GOOGLE.border,
        opacity: inert ? 0.6 : 1,
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={GOOGLE.text} />
      ) : (
        <>
          <GoogleMark />
          <Text
            className="font-sans-semibold text-[16px]"
            style={{ color: GOOGLE.text }}
            allowFontScaling
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
