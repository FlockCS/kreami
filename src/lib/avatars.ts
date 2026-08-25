import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/**
 * Avatars are capped at 256×256 (docs/03). At that size a JPEG is around 15 KB,
 * so the 1 GB free tier holds tens of thousands of them and egress stays
 * boring. The bucket enforces a 256 KB ceiling as a backstop, because
 * dimensions are not something Storage can check.
 */
const SIZE = 256;
const BUCKET = 'avatars';

/**
 * Opens the photo library and returns a square 256×256 JPEG, or null if the
 * person backed out.
 *
 * The resize is not a nicety: an unprocessed phone photo is 3–8 MB, which the
 * bucket would reject and the user would experience as "it just failed".
 * Cropping is offered where the OS supports it; where it does not, the resize
 * still guarantees a square.
 */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // Crop to a centred square BEFORE resizing. Resizing a 600x400 photo
  // straight to 256x256 does not crop it, it squashes it — faces go wide and
  // circles go oval. Native asks for a square crop up front and this is then a
  // no-op; web has no editing step at all, so this is the only thing standing
  // between a landscape photo and a distorted avatar.
  const side = Math.min(asset.width, asset.height);

  try {
    const context = ImageManipulator.manipulate(asset.uri);
    context.crop({
      originX: Math.round((asset.width - side) / 2),
      originY: Math.round((asset.height - side) / 2),
      width: side,
      height: side,
    });
    context.resize({ width: SIZE, height: SIZE });

    const rendered = await context.renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return image.uri;
  } catch (cause) {
    throw new Error(unreadable(asset.fileName ?? asset.mimeType ?? ''), { cause });
  }
}

/**
 * Why an image would not decode, in words somebody can act on.
 *
 * This exists because of how the failure arrives. On web, expo-image-manipulator
 * rejects with a bare `<canvas>` element rather than an Error, so anything
 * reading `.message` gets undefined and the whole thing fails in silence.
 *
 * HEIC is the case that actually happens: it is the iPhone default, the file
 * picker offers it because `accept` is `image/*`, and no browser except Safari
 * can decode it. The photo looks fine to the person choosing it.
 */
function unreadable(nameOrType: string): string {
  if (/heic|heif/i.test(nameOrType)) {
    return (
      'This browser cannot read HEIC photos, which is the format iPhones use by default. ' +
      'Pick a JPEG or PNG, or set Settings → Camera → Formats → Most Compatible on your ' +
      'phone and take a new one.'
    );
  }
  return 'That image could not be opened. Try a different photo, or a JPEG or PNG.';
}

/**
 * Uploads to `<user_id>/<timestamp>.jpg` and returns both the storage path and
 * the public URL.
 *
 * The filename changes on every upload, which matters more than it looks:
 * reusing one name means the URL never changes, so every CDN and every
 * expo-image disk cache keeps serving the old photo. A new name is the
 * cheapest cache-busting there is, and the old file is deleted straight after.
 */
async function upload(userId: string, uri: string) {
  // fetch() handles both a native file:// path and a web blob: URL, which is
  // why this is not two platform branches.
  const bytes = await (await fetch(uri)).arrayBuffer();

  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);

  return { path, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/**
 * Everything in this user's folder except the file they are now using.
 *
 * Deliberately derived from the bucket rather than tracked in a column: a
 * failure between upload and profile write would otherwise orphan a file
 * forever, and listing one user's folder is a single cheap call.
 *
 * Exported because deleting an account has to do the same sweep with nothing
 * kept — and it has to happen here, in a client holding the user's own
 * credentials. Postgres cannot do it: Supabase's storage.protect_delete()
 * trigger rejects direct SQL deletes from the storage tables outright, so a
 * `delete from storage.objects` inside delete_account() does not clean up, it
 * aborts the deletion. See the migration for the full account.
 */
export async function removeOthers(userId: string, keep: string | null) {
  const { data, error } = await supabase.storage.from(BUCKET).list(userId);
  if (error || !data) return;

  const stale = data.map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale);
}

/**
 * Sets or clears the signed-in user's photo. Pass a local uri from
 * `pickAvatar()`, or null to go back to the glyph — which is also the only way
 * to get rid of the photo Google supplied at sign-up.
 *
 * Cancelling the picker never reaches here: that is an ordinary "changed my
 * mind", not a failed mutation, so the screen simply does not call this.
 */
export function useSetAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, uri }: { userId: string; uri: string | null }) => {
      const uploaded = uri ? await upload(userId, uri) : null;

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: uploaded?.url ?? null })
        .eq('id', userId);
      if (error) throw new Error(error.message);

      // Only once the profile points at the new file, so a failure above
      // leaves the old photo working rather than a broken link.
      await removeOthers(userId, uploaded?.path ?? null);
      return uploaded?.url ?? null;
    },
    onSuccess: () => {
      // The photo appears on every surface that names a person, so this is the
      // one mutation in the app that legitimately invalidates nearly all of it.
      for (const key of ['profile', 'public-profile', 'home-feed', 'global-feed', 'follow-list']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
