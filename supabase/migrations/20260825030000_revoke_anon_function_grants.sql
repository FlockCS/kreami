-- Security fix: the previous migration's `revoke execute ... from public` did
-- not actually remove anon's access.
--
-- Supabase ships default privileges that grant EXECUTE on new functions in the
-- public schema to `anon` and `authenticated` DIRECTLY. Revoking from PUBLIC
-- removes only the implicit grant, leaving the direct one intact — so all three
-- functions stayed callable without a session. claim_handle() and
-- delete_account() were still refusing to act, but only because of their own
-- `auth.uid() is null` check; the privilege boundary itself was open.
--
-- The lesson generalises: on Supabase, every function must be revoked from
-- `anon` by name. See docs/09-security-moderation.md.
--
-- Applied as a new migration rather than an edit: 20260825020000 has already run
-- against kreami-dev, and migrations are append-only once applied anywhere.

revoke execute on function public.handle_available(text) from anon;
revoke execute on function public.claim_handle(text) from anon;
revoke execute on function public.delete_account() from anon;

-- keepalive() is deliberately left open to anon: the scheduled workflow calls it
-- with the anon key and it exposes nothing but the server clock.
