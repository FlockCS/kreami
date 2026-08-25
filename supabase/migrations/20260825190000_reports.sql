-- Phase 5: reports.
--
-- The report queue is the moderation system (docs/09). There is no admin UI
-- and deliberately so: at this volume reviewing it is a few minutes a week in
-- the SQL editor, and building a console before there are reports to read is
-- premature. The views at the bottom are that console.

create type public.report_reason as enum
  ('spam', 'harassment', 'hate', 'sexual', 'violence', 'duplicate_experience', 'other');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,

  reason public.report_reason not null,
  detail text check (char_length(detail) <= 300),

  -- Exactly one target. The constraint is the schema saying what the UI must
  -- not get wrong: a report about "this Kreami and also that person" has no
  -- single thing to action.
  kreami_id uuid references public.kreamis (id) on delete cascade,
  reply_id uuid references public.replies (id) on delete cascade,
  experience_id uuid references public.experiences (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,

  resolved_at timestamptz,
  -- What was done, in your own words, when you close it. Null while open.
  resolution text check (char_length(resolution) <= 300),

  created_at timestamptz not null default now(),

  constraint reports_exactly_one_target check (
    (kreami_id is not null)::int + (reply_id is not null)::int +
    (experience_id is not null)::int + (target_user_id is not null)::int = 1
  )
);

-- The queue is read open-first, oldest-first: the only ordering that matters.
create index reports_open_idx on public.reports (created_at)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- RLS: nobody reads reports through the API. Not even your own.
--
-- Reading your own back sounds harmless and is not: it turns the queue into a
-- channel — file a report, watch for it to disappear, learn exactly what gets
-- actioned and how fast. Reports go in and are answered by moderation, not by
-- a status page.
-- ---------------------------------------------------------------------------

alter table public.reports enable row level security;

revoke all on public.reports from anon, authenticated;

-- No select policy at all, and no insert policy: writes go through
-- submit_report(), which is where the rate limit lives.

/**
 * File a report.
 *
 * Rate-limited at 10/hour because report-flooding is itself a harassment tool
 * (docs/09): a mob filing hundreds of reports against one person both buries
 * the real queue and makes the target look guilty by volume.
 */
create or replace function public.submit_report(
  reason public.report_reason,
  detail text default null,
  kreami uuid default null,
  experience uuid default null,
  target_user uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean text := nullif(btrim(coalesce(detail, '')), '');
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if (kreami is not null)::int + (experience is not null)::int
     + (target_user is not null)::int <> 1 then
    raise exception 'A report is about exactly one thing';
  end if;

  if char_length(coalesce(clean, '')) > 300 then
    raise exception 'Keep the detail under 300 characters';
  end if;

  -- Reporting yourself is not a moderation event.
  if target_user = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  perform public.assert_rate_limit('report', 10, interval '1 hour');

  insert into public.reports (reporter_id, reason, detail, kreami_id, experience_id, target_user_id)
  values (auth.uid(), reason, clean, kreami, experience, target_user)
  returning id into new_id;

  return new_id;
end $$;

revoke execute on function public.submit_report(public.report_reason, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.submit_report(public.report_reason, text, uuid, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The admin console, such as it is.
--
-- These are views, not functions, and carry no grants: they are readable by
-- the service role in the Supabase SQL editor and by nobody else. See docs/09.
-- ---------------------------------------------------------------------------

create or replace view public.admin_report_queue as
  select r.id,
         r.created_at,
         r.reason,
         r.detail,
         reporter.handle as reported_by,

         case
           when r.kreami_id is not null then 'kreami'
           when r.reply_id is not null then 'reply'
           when r.experience_id is not null then 'experience'
           else 'user'
         end as target_kind,

         -- The content itself, so the queue can be judged without joining out
         -- to four other tables by hand at 2am.
         coalesce(
           k.note,
           e.title,
           targeted.handle
         ) as target,
         coalesce(k.is_hidden, e.is_hidden, targeted.is_suspended) as already_actioned,

         -- The ids you need to act: update kreamis/experiences set is_hidden,
         -- or profiles set is_suspended.
         r.kreami_id,
         r.experience_id,
         coalesce(r.target_user_id, k.user_id) as user_id
    from public.reports r
    join public.profiles reporter on reporter.id = r.reporter_id
    left join public.kreamis k on k.id = r.kreami_id
    left join public.experiences e on e.id = r.experience_id
    left join public.profiles targeted on targeted.id = r.target_user_id
   where r.resolved_at is null
   order by r.created_at;

comment on view public.admin_report_queue is
  'Open reports, oldest first. Read in the SQL editor as service_role. Act with: update kreamis set is_hidden = true where id = ...; update profiles set is_suspended = true where id = ...; then update reports set resolved_at = now(), resolution = ''...''.';

-- The only repair mechanism the exact-match rule has (docs/05). Trigram
-- similarity over titles, so near-misses that should have been one experience
-- surface as candidates for merge_experiences().
create or replace view public.admin_duplicate_candidates as
  select a.id as loser_id,
         b.id as winner_id,
         a.title as loser_title,
         b.title as winner_title,
         a.kreami_count as loser_kreamis,
         b.kreami_count as winner_kreamis,
         round(extensions.similarity(a.normalized_title, b.normalized_title)::numeric, 3) as score
    from public.experiences a
    join public.experiences b
      -- a.id < b.id yields each pair once rather than twice and never against
      -- itself. The operator is schema-qualified because pg_trgm lives in
      -- `extensions`, and a view cannot carry a search_path the way the
      -- security-definer functions do — it resolves names once, at creation.
      on a.id < b.id
     and a.normalized_title operator(extensions.%) b.normalized_title
   where a.merged_into_experience_id is null
     and b.merged_into_experience_id is null
     and extensions.similarity(a.normalized_title, b.normalized_title) > 0.5
   order by extensions.similarity(a.normalized_title, b.normalized_title) desc;

comment on view public.admin_duplicate_candidates is
  'Trigram-similar experience pairs, most similar first. Merge with: select merge_experiences(loser_id, winner_id). The loser redirects to the winner; nothing is deleted.';

-- Is the exact-match rule fragmenting the corpus? This is the number docs/10
-- calls the most important in the app.
create or replace view public.admin_matching_stats as
  select (select count(*) from public.experiences where merged_into_experience_id is null)
           as experiences,
         (select count(*) from public.kreamis where is_hidden = false) as kreamis,
         (select round(avg(kreami_count), 2) from public.experiences
           where merged_into_experience_id is null) as mean_kreamis_per_experience,
         (select percentile_cont(0.5) within group (order by kreami_count)
            from public.experiences
           where merged_into_experience_id is null
             and created_at < now() - interval '7 days') as median_kreamis_per_experience,
         (select count(*) from public.experiences
           where merged_into_experience_id is null and kreami_count = 1) as singletons,
         (select count(*) filter (where outcome = 'new')::numeric
                 / nullif(count(*), 0)
            from public.experience_resolution_log) as share_resolving_to_new;

comment on view public.admin_matching_stats is
  'The three numbers docs/10 Phase 6 says to watch. Median Kreamis per Experience sitting at 1.0 means exact-match is fragmenting the corpus; the remedies are ordered in docs/05.';

-- Views inherit no grants here: anon and authenticated were never granted
-- anything on them, so they are reachable only by service_role.
revoke all on public.admin_report_queue from anon, authenticated;
revoke all on public.admin_duplicate_candidates from anon, authenticated;
revoke all on public.admin_matching_stats from anon, authenticated;
