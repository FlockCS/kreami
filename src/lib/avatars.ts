import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { decodeHeic } from './heic';
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

  // An iPhone photo is HEIC unless its owner has changed a setting they have
  // never heard of, so this is the common case, not the exotic one.
  //
  // A zero dimension is the signal. The picker sizes an image by loading it,
  // and reports 0x0 for anything the platform could not read — which is
  // precisely when a decoder of our own is worth reaching for, and only then.
  // Native never gets here (the OS reads HEIC), and neither does Safari (it
  // reads HEIC too), so neither downloads three megabytes to be told what they
  // already knew.
  const unreadableHere = !asset.width || !asset.height;
  const decoded = unreadableHere ? await decodeHeic(asset.uri) : null;

  const uri = decoded?.uri ?? asset.uri;
  const width = decoded?.width ?? asset.width;
  const height = decoded?.height ?? asset.height;

  // Crop to a centred square BEFORE resizing. Resizing a 600x400 photo
  // straight to 256x256 does not crop it, it squashes it — faces go wide and
  // circles go oval. Native asks for a square crop up front and this is then a
  // no-op; web has no editing step at all, so this is the only thing standing
  // between a landscape photo and a distorted avatar.
  // Still unsized means nothing here can read it: a corrupt file, or a format
  // this browser does not know and the HEIC decoder does not cover. Worth
  // catching explicitly, because cropping against zero produces a zero-sized
  // rectangle and then a failure much further down.
  if (!width || !height) {
    throw new Error(unreadable(asset.fileName ?? asset.mimeType ?? ''));
  }

  const side = Math.min(width, height);

  try {
    const context = ImageManipulator.manipulate(uri);
    context.crop({
      originX: Math.round((width - side) / 2),
      originY: Math.round((height - side) / 2),
      width: side,
      height: side,
    });
    context.resize({ width: SIZE, height: SIZE });

    const rendered = await context.renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return image.uri;
  } catch (cause) {
    throw new Error(unreadable(asset.fileName ?? asset.mimeType ?? ''), { cause });
  } finally {
    // The decoder's intermediate JPEG has been read by now; without this it
    // stays in memory for the life of the tab.
    if (decoded) URL.revokeObjectURL(decoded.uri);
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
    // Reaching this means the HEIC decoder ran and still could not read it —
    // a truncated file, or a container variant libheif does not cover — so the
    // advice is about this photo, not about the format.
    return 'That photo could not be read. It may be damaged — try another one.';
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
