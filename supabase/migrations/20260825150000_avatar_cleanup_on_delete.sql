-- Undoing a wrong turn, and recording why it was wrong.
--
-- Deleting your account must delete your photo: the avatars bucket is public,
-- and a face left behind after somebody asks to be forgotten is a privacy
-- failure, not untidiness. The obvious place to do that is delete_account(),
-- so a first attempt added a `delete from storage.objects` there.
--
-- It cannot work. Supabase installs a storage.protect_delete() trigger that
-- rejects any direct SQL delete from the storage tables:
--
--   ERROR: Direct deletion from storage tables is not allowed.
--   Use the Storage API instead.
--
-- Which means the attempt did worse than nothing. The raise happened BEFORE
-- `delete from auth.users`, so delete_account() failed outright and accounts
-- stopped being deletable at all — found because four e2e accounts survived a
-- run that reported deleting them. A privacy fix that quietly breaks account
-- deletion is the worst possible trade.
--
-- So the deletion happens client-side now, through the Storage API, in the
-- same handler that calls this function and immediately before it — see
-- src/app/settings.tsx. The RLS policy that permits it is the ordinary
-- avatars_own_delete: it is your own folder, and you are deleting it.
--
-- The residual risk is a client that dies between the two calls, orphaning one
-- ~5 KB file. That is in BACKLOG; the fix is a sweeper, and it needs a place
-- to run that this project does not have yet.

-- The policy the first attempt added to chase a misdiagnosed RLS failure. The
-- real blocker was the trigger, and postgres has rolbypassrls anyway, so this
-- never did anything.
drop policy if exists avatars_own_delete_any_role on storage.objects;

-- Back to exactly the Phase 1 definition.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

comment on function public.delete_account() is
  'Permanently deletes the calling user. Cascades to all owned rows. Storage is NOT covered — the client removes the avatar first; see src/app/settings.tsx.';
