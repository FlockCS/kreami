-- Avatars: the one thing Kreami stores as a file.
--
-- docs/03 budgets Supabase Storage for "avatars only, capped at 256×256, and
-- it is effectively unlimited". This migration is where that cap stops being a
-- sentence in a document: the bucket refuses anything over 256 KB and anything
-- that is not a JPEG, PNG or WebP, so a client bug cannot fill the free tier.
-- The client resizes to 256×256 before it uploads; the bucket is the backstop,
-- because dimensions are not something Storage can check.
--
-- Public read, because a Kreami's author is shown to logged-out visitors on
-- every shared link (docs/04). Writes are scoped to your own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  262144,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Every object lives at `<user_id>/<something>`, so the first path segment is
-- the whole authorisation rule: you may write inside your own folder and
-- nobody else's. storage.foldername() splits the path for exactly this.
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update as well as insert: replacing a photo with the same filename is an
-- upsert, and without this it fails in a way that looks like a network error.
create policy avatars_own_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deleting the previous file is part of changing your photo. Without it every
-- change leaks a file that nothing references and nothing will ever collect.
create policy avatars_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
