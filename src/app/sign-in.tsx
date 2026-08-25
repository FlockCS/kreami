import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { GoogleButton } from '@/components/google-button';
import { signInWithEmail, signInWithGoogle } from '@/lib/auth';
import { colors } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const google = useMutation({ mutationFn: signInWithGoogle });

  const magicLink = useMutation({
    mutationFn: signInWithEmail,
    onSuccess: (_data, sentTo) => setLinkSentTo(sentTo),
  });

  function submitEmail() {
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setEmailError('Enter an email address you can open right now.');
      return;
    }
    setEmailError(null);
    magicLink.mutate(value);
  }

  const busy = google.isPending || magicLink.isPending;
  const failure = google.error?.message ?? magicLink.error?.message ?? null;

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-1 justify-center px-6 pb-10">
        <Text className="font-serif text-[44px] leading-none text-ink">Kreami</Text>
        <Text className="mt-4 font-sans text-[17px] leading-7 text-body">
          Rate literally any experience, on one scale.
        </Text>

        <View className="mt-3 h-px bg-ink" />

        {linkSentTo ? (
          <View className="mt-8">
            <Text className="font-sans text-[10px] tracking-label text-muted">
              CHECK YOUR EMAIL
            </Text>
            <Text className="mt-3 font-serif text-[26px] leading-8 text-ink">{linkSentTo}</Text>
            <Text className="mt-3 font-sans text-[15px] leading-6 text-body">
              We sent a link that signs you in. It expires in an hour.
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-6 h-12 items-center justify-center"
              onPress={() => {
                setLinkSentTo(null);
                magicLink.reset();
              }}
            >
              <Text className="font-sans text-[14px] text-ink underline">
                Use a different email
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="mt-8">
            <GoogleButton
              loading={google.isPending}
              disabled={busy}
              onPress={() => google.mutate()}
            />

            <View className="my-7 flex-row items-center gap-4">
              <View className="h-px flex-1 bg-rule" />
              <Text className="font-sans text-[10px] tracking-label text-muted">OR</Text>
              <View className="h-px flex-1 bg-rule" />
            </View>

            <Text className="font-sans text-[10px] tracking-label text-muted">EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (emailError) setEmailError(null);
              }}
              onSubmitEditing={submitEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              inputMode="email"
              returnKeyType="go"
              accessibilityLabel="Email address"
              className="mt-2 border-b border-ink pb-2 font-serif text-[24px] text-ink"
            />
            {emailError ? (
              <Text className="mt-2 font-sans text-[13px]" style={{ color: colors.accent }}>
                {emailError}
              </Text>
            ) : null}

            <View className="mt-5">
              <Button
                label="Send a magic link"
                variant="secondary"
                loading={magicLink.isPending}
                disabled={busy}
                onPress={submitEmail}
              />
            </View>
          </View>
        )}

        {failure ? (
          <Text className="mt-6 font-sans text-[13px] leading-5" style={{ color: colors.accent }}>
            {failure}
          </Text>
        ) : null}

        <Text className="mt-8 font-sans text-[12px] leading-5 text-muted">
          Your Kreamis are public and permanent, including edits.
        </Text>
      </View>
    </SafeAreaView>
  );
}
