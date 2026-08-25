import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { useProfile, useSession } from '@/lib/auth';
import { pickAvatar, useSetAvatar } from '@/lib/avatars';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/tokens';

const MAX_NAME = 40;
const MAX_BIO = 160;

/**
 * Only the fields the database will actually accept from a client. Handles go
 * through claim_handle() because of the change cooldown, and the counters are
 * trigger-maintained — neither is granted at the column level, so neither can
 * appear here even by mistake. See docs/11 D16.
 */
export default function EditProfile() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useProfile();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(profile.data?.display_name ?? '');
  const [bio, setBio] = useState(profile.data?.bio ?? '');

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim(), bio: bio.trim() || null })
        .eq('id', session!.user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
      router.back();
    },
  });

  const nameProblem = displayName.trim().length === 0 ? 'A display name is required.' : null;

  return (
    <SafeAreaView className="flex-1 bg-paper" style={{ backgroundColor: colors.paper }}>
      <View className="flex-row items-center gap-4 px-6 pb-2 pt-5">
        <Text
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-11 py-3 font-sans text-[15px] text-ink"
        >
          Cancel
        </Text>
        <Text className="font-serif text-[26px] leading-none text-ink">Edit profile</Text>
      </View>
      <View className="mx-6 mt-2 h-px bg-ink" />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Text className="pb-3 pt-7 font-sans text-[10px] tracking-label text-muted">PHOTO</Text>
        <PhotoField userId={session?.user.id} url={profile.data?.avatar_url} />

        <Text className="pb-2 pt-8 font-sans text-[10px] tracking-label text-muted">
          DISPLAY NAME
        </Text>
        <TextInput
          value={displayName}
          onChangeText={(t) => setDisplayName(t.slice(0, MAX_NAME))}
          maxLength={MAX_NAME}
          accessibilityLabel="Display name"
          className="border-b border-ink pb-2 font-serif text-[24px] text-ink"
        />
        <View className="mt-2 flex-row justify-between">
          <Text className="font-sans text-[12px]" style={{ color: colors.accent }}>
            {nameProblem ?? ''}
          </Text>
          <Text className="font-sans text-[11px] text-muted">
            {MAX_NAME - displayName.length} left
          </Text>
        </View>

        <Text className="pb-2 pt-8 font-sans text-[10px] tracking-label text-muted">BIO</Text>
        <TextInput
          value={bio}
          onChangeText={(t) => setBio(t.slice(0, MAX_BIO))}
          placeholder="Rating the mundane since 2026."
          placeholderTextColor={colors.empty}
          multiline
          maxLength={MAX_BIO}
          accessibilityLabel="Bio"
          className="min-h-14 border-b border-ink pb-2 font-sans text-[16px] leading-6 text-ink"
        />
        <View className="mt-2 flex-row justify-end">
          <Text className="font-sans text-[11px] text-muted">{MAX_BIO - bio.length} left</Text>
        </View>

        <Text className="pt-6 font-sans text-[12px] leading-5 text-muted">
          Your handle is changed in Settings.
        </Text>

        {save.error ? (
          <Text className="mt-4 font-sans text-[13px]" style={{ color: colors.accent }}>
            {save.error.message}
          </Text>
        ) : null}

        <View className="mt-8">
          <Button
            label="Save"
            loading={save.isPending}
            disabled={Boolean(nameProblem)}
            onPress={() => save.mutate()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The photo, and the two things you can do to it.
 *
 * The avatar itself is the button — tapping your own face to change it is the
 * one gesture everybody already knows — with a text control beside it so the
 * action is still discoverable to a screen reader and to anybody who does not
 * think to try.
 */
function PhotoField({
  userId,
  url,
}: {
  userId: string | undefined;
  url: string | null | undefined;
}) {
  const setAvatar = useSetAvatar();

  async function change() {
    if (!userId) return;
    const uri = await pickAvatar();
    // Backing out of the picker is a decision, not a failure. Nothing happens.
    if (!uri) return;
    setAvatar.mutate({ userId, uri });
  }

  return (
    <View>
      <View className="flex-row items-center gap-5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={url ? 'Change your photo' : 'Add a photo'}
          accessibilityState={{ busy: setAvatar.isPending }}
          disabled={setAvatar.isPending || !userId}
          onPress={change}
        >
          <Avatar url={url} size={72} />
          {setAvatar.isPending ? (
            <View
              className="absolute inset-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(250, 247, 241, 0.72)' }}
            >
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : null}
        </Pressable>

        <View className="flex-1 gap-1">
          <Pressable
            accessibilityRole="button"
            disabled={setAvatar.isPending || !userId}
            onPress={change}
            className="min-h-11 justify-center"
          >
            <Text className="font-sans-semibold text-[15px] text-ink">
              {url ? 'Change photo' : 'Add a photo'}
            </Text>
          </Pressable>

          {url ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove your photo"
              disabled={setAvatar.isPending}
              onPress={() => userId && setAvatar.mutate({ userId, uri: null })}
              className="min-h-11 justify-center"
            >
              <Text className="font-sans text-[15px]" style={{ color: colors.accent }}>
                Remove
              </Text>
            </Pressable>
          ) : (
            <Text className="font-sans text-[12px] leading-5 text-muted">
              Square, and shrunk to 256px. Optional — the outline is a perfectly good face.
            </Text>
          )}
        </View>
      </View>

      {setAvatar.error ? (
        <Text className="mt-3 font-sans text-[13px]" style={{ color: colors.accent }}>
          {setAvatar.error.message}
        </Text>
      ) : null}
    </View>
  );
}
