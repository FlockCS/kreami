-- Supabase pauses free projects after ~7 days without activity, and it is the
-- Postgres instance that pauses. A request to /auth/v1/health answers without
-- necessarily touching the database, so the cron needs something that does.
--
-- This function exists solely so .github/workflows/keepalive.yml can force a
-- real database round trip through PostgREST. It reads nothing and exposes
-- nothing beyond the server clock.
--
-- Not SECURITY DEFINER: it needs no elevated rights, so it does not get any.

create or replace function public.keepalive()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

comment on function public.keepalive() is
  'No-op used by the scheduled keepalive workflow to prevent the free-tier project pausing.';

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
