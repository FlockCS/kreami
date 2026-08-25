-- Phase 5: the nightly job.
--
-- Three chores that all have the same shape — cheap, boring, and the kind of
-- thing that is invisible until the day it matters:
--
--   1. Reconcile the trigger-maintained counters against their source.
--   2. Prune rate_limit_events, which otherwise becomes the biggest table here.
--   3. Report how many duplicate candidates are waiting.
--
-- Run by .github/workflows/nightly.yml, next to the keepalive that already
-- exists. Returns a row so the workflow log says what happened rather than
-- just exiting zero.

/**
 * Recompute every counter from the rows it counts, and report the drift.
 *
 * The counters exist because computing them per read does not scale, and they
 * are maintained by triggers — which are correct until they are not. Concurrent
 * writes, a failed transaction at the wrong moment, or a future trigger edit
 * all drift them silently, and a wrong follower count is the kind of bug that
 * gets noticed months later by a user rather than by us. docs/04 asks for this.
 *
 * Repairs unconditionally and returns what it changed, so a clean night is
 * zeros and a bad night is a number to go and understand.
 */
create or replace function public.reconcile_counters()
returns table (counter text, rows_fixed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  with truth as (
    select p.id,
           (select count(*) from public.kreamis k
             where k.user_id = p.id and k.is_hidden = false)::integer as kreamis,
           (select count(*) from public.follows f where f.followee_id = p.id)::integer as followers,
           (select count(*) from public.follows f where f.follower_id = p.id)::integer as following
      from public.profiles p
  ),
  fixed as (
    update public.profiles p
       set kreami_count = t.kreamis,
           follower_count = t.followers,
           following_count = t.following
      from truth t
     where t.id = p.id
       and (p.kreami_count, p.follower_count, p.following_count)
           is distinct from (t.kreamis, t.followers, t.following)
    returning 1
  )
  select count(*)::integer into n from fixed;
  counter := 'profiles'; rows_fixed := n; return next;

  with truth as (
    select k.id,
           (select count(*) from public.likes l where l.kreami_id = k.id)::integer as likes,
           (select count(*) from public.replies r
             where r.kreami_id = k.id and r.is_hidden = false)::integer as replies
      from public.kreamis k
  ),
  fixed as (
    update public.kreamis k
       set like_count = t.likes, reply_count = t.replies
      from truth t
     where t.id = k.id
       and (k.like_count, k.reply_count) is distinct from (t.likes, t.replies)
    returning 1
  )
  select count(*)::integer into n from fixed;
  counter := 'kreamis'; rows_fixed := n; return next;

  -- Experience aggregates drive the averages on every thread, so they get the
  -- same treatment. rating_sum and kreami_count must agree with the Kreamis
  -- that are actually visible.
  with truth as (
    select e.id,
           (select count(*) from public.kreamis k
             where k.experience_id = e.id and k.is_hidden = false)::integer as cnt,
           (select coalesce(sum(k.rating), 0) from public.kreamis k
             where k.experience_id = e.id and k.is_hidden = false)::integer as total
      from public.experiences e
  ),
  fixed as (
    update public.experiences e
       set kreami_count = t.cnt, rating_sum = t.total
      from truth t
     where t.id = e.id
       and (e.kreami_count, e.rating_sum) is distinct from (t.cnt, t.total)
    returning 1
  )
  select count(*)::integer into n from fixed;
  counter := 'experiences'; rows_fixed := n; return next;
end $$;

/**
 * The nightly job itself. One call, so the workflow is one curl.
 *
 * Not scheduled inside Postgres: pg_cron is not available on the free tier,
 * and the project already runs scheduled work through GitHub Actions for the
 * keepalive. One mechanism is easier to reason about than two.
 */
create or replace function public.nightly_maintenance()
returns table (task text, detail text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pruned integer;
  drift integer;
  dupes integer;
begin
  select coalesce(sum(rows_fixed), 0) into drift from public.reconcile_counters();
  task := 'counter_drift';
  detail := drift || ' row(s) corrected';
  return next;

  -- Two days is enough: the longest rate-limit window is an hour, so anything
  -- older can never affect a decision. docs/09 warns this becomes the biggest
  -- table in the database if left.
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
  get diagnostics pruned = row_count;
  task := 'rate_limit_events_pruned';
  detail := pruned || ' row(s)';
  return next;

  select count(*)::integer into dupes from public.admin_duplicate_candidates;
  task := 'duplicate_candidates';
  detail := dupes || ' pair(s) above 0.5 similarity';
  return next;

  select count(*)::integer into dupes from public.reports where resolved_at is null;
  task := 'open_reports';
  detail := dupes || ' waiting';
  return next;
end $$;

-- Both are service-role only: they are maintenance, not API.
revoke execute on function public.reconcile_counters() from public, anon, authenticated;
revoke execute on function public.nightly_maintenance() from public, anon, authenticated;
