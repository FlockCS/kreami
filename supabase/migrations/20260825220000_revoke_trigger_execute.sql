-- Close the last finding from security_audit(): trigger functions still
-- executable by PUBLIC.
--
-- Every function in Postgres is granted EXECUTE to PUBLIC on creation, and the
-- migrations here revoke that by name for anything callable through the API —
-- but never did for the trigger functions, because nobody calls those. That
-- reasoning is right and the grant is still wrong: docs/09 asks that every
-- security definer function have execute revoked from public, without an
-- exception for the ones that look unreachable, and "looks unreachable" is
-- exactly the kind of assumption that stops being true quietly.
--
-- Revoking is safe for the triggers themselves: EXECUTE on a trigger function
-- is checked when the trigger is CREATED, not each time it fires. The e2e run
-- exercises all nine — signup, posting, editing, following, liking — and is
-- the actual evidence.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prorettype = 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke execute on function %s from public', fn.signature);
  end loop;
end $$;
