import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * Every button in the app.
 *
 * It exists because of a real bug: NativeWind takes over the `style` prop when
 * `className` is present, so Pressable's function form — `style={({pressed}) =>
 * …}` — is silently dropped. A filled button written that way renders with a
 * transparent background and, since its label is paper-coloured, becomes
 * invisible against the paper background. Pressed state belongs in the
 * `active:` variant instead.
 */

type Variant = 'primary' | 'secondary';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
};

const base = 'h-14 flex-row items-center justify-center';

const surface: Record<Variant, string> = {
  primary: 'bg-accent active:bg-accent-press',
  secondary: 'border border-ink active:bg-fill',
};

const labelStyle: Record<Variant, string> = {
  primary: 'font-sans-semibold text-[16px] text-paper',
  secondary: 'font-sans-semibold text-[16px] text-ink',
};

export function Button({ label, variant = 'primary', loading, disabled, ...rest }: Props) {
  const inert = Boolean(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: Boolean(loading) }}
      disabled={inert}
      className={`${base} ${inert ? 'bg-fill' : surface[variant]}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.paper : colors.ink} />
      ) : (
        <Text className={inert ? 'font-sans-semibold text-[16px] text-muted' : labelStyle[variant]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
