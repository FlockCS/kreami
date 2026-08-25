-- Phase 5: the checklist, as a query.
--
-- docs/09 lists what must be true before launch. Three of those items are
-- facts about the catalogue rather than opinions, which means they can be
-- checked rather than remembered — and re-checked on the day somebody adds a
-- table in a hurry.
--
-- Every row it returns is a finding with a count that must be zero. Called by
-- `npm run verify:security`.

create or replace function public.security_audit()
returns table (finding text, count integer, detail text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- RLS on every table. A table without it is readable and writable by anyone
  -- holding the anon key, which is shipped in the client bundle by design.
  return query
    select 'every table has RLS enabled',
           count(*)::integer,
           string_agg(c.relname, ', ')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity;

  -- A security definer function without a fixed search_path can be hijacked by
  -- a caller who puts their own table earlier in the path — it runs as the
  -- owner, so that is a privilege escalation, not a bug.
  return query
    select 'every security definer function pins search_path',
           count(*)::integer,
           string_agg(p.proname, ', ')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (p.proconfig is null
            or not exists (
              select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'
            ));

  -- PUBLIC includes every role there will ever be, so a grant to it survives
  -- any later revoke from anon. Functions are granted to PUBLIC by default,
  -- which is why every migration here revokes explicitly.
  return query
    select 'no function is executable by PUBLIC',
           count(*)::integer,
           string_agg(p.proname, ', ')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('public', p.oid, 'execute')
       -- keepalive() is deliberately open: the scheduled workflow calls it
       -- with the anon key and it returns nothing but the server clock.
       and p.proname <> 'keepalive';

  -- A table with RLS on and no policy is not "locked down" by accident, it is
  -- locked down on purpose — but it should be on purpose. These are the ones
  -- reachable only through security definer functions; flagging any that also
  -- carry direct grants catches a table that is half-open.
  return query
    select 'no table grants write access directly to anon',
           count(*)::integer,
           string_agg(table_name || '.' || privilege_type, ', ')
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'anon'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
end $$;

revoke execute on function public.security_audit() from public, anon, authenticated;

comment on function public.security_audit() is
  'The mechanical half of the docs/09 pre-launch checklist. Every row must report zero. Run via npm run verify:security.';
