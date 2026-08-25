-- Phase 2: the core loop — topics and Kreamis.
--
-- See docs/05-topic-matching.md for the matching rule this implements and
-- docs/04-data-model.md for the intended shape.
--
-- Note on search_path: pg_trgm lives in the `extensions` schema on Supabase, so
-- any function using similarity() or the % operator must name it explicitly or
-- it will fail with "operator does not exist".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.topics (
  id uuid primary key default gen_random_uuid(),

  -- As first written, for display.
  title text not null check (char_length(title) between 2 and 80),

  -- The matching key: lowercase, whitespace-collapsed, trimmed. Nothing else.
  -- See normalize_topic_title() below.
  normalized_title text not null,

  slug text not null unique,

  created_by uuid references public.profiles (id) on delete set null,

  kreami_count integer not null default 0 check (kreami_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),

  -- When set, this topic is a tombstone and all reads redirect to the target.
  merged_into_topic_id uuid references public.topics (id),

  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

-- Exactly one live topic per normalized string. This is what makes "an exact
-- match cannot create a duplicate" a database guarantee rather than an
-- application convention — two simultaneous posts of the same text race here
-- and one of them loses.
create unique index topics_normalized_live_idx
  on public.topics (normalized_title)
  where merged_into_topic_id is null;

-- Powers search-as-you-type and the duplicate-candidate report. NOT used for
-- resolution, which is exact-match only.
create index topics_normalized_trgm_idx
  on public.topics using gin (normalized_title extensions.gin_trgm_ops);

create index topics_activity_idx
  on public.topics (kreami_count desc, created_at desc)
  where merged_into_topic_id is null and is_hidden = false;

create table public.topic_aliases (
  normalized_title text primary key,
  topic_id uuid not null references public.topics (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.kreamis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,

  rating smallint not null check (rating between 0 and 5),
  note text check (char_length(note) <= 150),

  like_count integer not null default 0 check (like_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),

  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One Kreami per person per topic. Posting again edits rather than adding, so
  -- averages cannot be stuffed.
  constraint kreamis_one_per_user_topic unique (user_id, topic_id)
);

create index kreamis_topic_idx on public.kreamis (topic_id, created_at desc)
  where is_hidden = false;
create index kreamis_user_idx on public.kreamis (user_id, created_at desc)
  where is_hidden = false;
create index kreamis_feed_idx on public.kreamis (created_at desc, user_id)
  where is_hidden = false;

-- Every resolution, so the exact-match rule can be judged on evidence rather
-- than anecdote. See docs/05, "Still log every resolution".
create table public.topic_resolution_log (
  id bigint generated always as identity primary key,
  raw_input text not null,
  normalized text not null,
  matched_topic_id uuid references public.topics (id) on delete set null,
  outcome text not null check (outcome in ('exact', 'alias', 'new')),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index topic_resolution_log_created_idx
  on public.topic_resolution_log (created_at desc);

-- Rate limiting lives in Postgres because there is no API gateway. See docs/09.
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_idx
  on public.rate_limit_events (user_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- Normalization and slugs
-- ---------------------------------------------------------------------------

-- Implements "the same text, ignoring case" and nothing more. Deliberately does
-- NOT strip punctuation, fold plurals, drop articles or unaccent: each of those
-- would be the system overruling a visible character the user typed. Trimming
-- and whitespace-collapsing are included because a trailing space is not
-- something anyone perceives as different text. See docs/05.
create or replace function public.normalize_topic_title(raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(lower(raw), '\s+', ' ', 'g'));
$$;

create or replace function public.slugify(raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(btrim(regexp_replace(regexp_replace(lower(raw), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), '-'),
    ''),
    'topic'
  );
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

create or replace function public.assert_rate_limit(
  action text,
  max_count integer,
  window_size interval
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  select count(*) into n
    from public.rate_limit_events e
   where e.user_id = auth.uid()
     and e.action = assert_rate_limit.action
     and e.created_at > now() - window_size;

  if n >= max_count then
    raise exception 'Rate limit exceeded: %', action using errcode = 'P0001';
  end if;

  insert into public.rate_limit_events (user_id, action) values (auth.uid(), action);
end $$;

-- ---------------------------------------------------------------------------
-- Aggregates
-- ---------------------------------------------------------------------------

create or replace function public.recompute_topic_aggregates(target uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.topics t
     set kreami_count = coalesce(agg.n, 0),
         rating_sum = coalesce(agg.total, 0)
    from (
      select count(*) as n, sum(rating) as total
        from public.kreamis
       where topic_id = target and is_hidden = false
    ) agg
   where t.id = target;
$$;

-- Counters are trigger-maintained, never application-maintained: application
-- code that forgets to decrement produces drift you reconcile for years.
create or replace function public.bump_kreami_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.topics
       set kreami_count = kreami_count + 1, rating_sum = rating_sum + new.rating
     where id = new.topic_id;
    update public.profiles
       set kreami_count = kreami_count + 1
     where id = new.user_id;

  elsif tg_op = 'UPDATE' then
    if new.topic_id <> old.topic_id then
      -- Only merge_topics() moves a Kreami; recompute both sides from source.
      perform public.recompute_topic_aggregates(old.topic_id);
      perform public.recompute_topic_aggregates(new.topic_id);
    elsif new.rating is distinct from old.rating then
      update public.topics
         set rating_sum = rating_sum - old.rating + new.rating
       where id = new.topic_id;
    end if;

  elsif tg_op = 'DELETE' then
    update public.topics
       set kreami_count = greatest(kreami_count - 1, 0),
           rating_sum = greatest(rating_sum - old.rating, 0)
     where id = old.topic_id;
    update public.profiles
       set kreami_count = greatest(kreami_count - 1, 0)
     where id = old.user_id;
  end if;

  return coalesce(new, old);
end $$;

create trigger kreamis_aggregates
  after insert or update or delete on public.kreamis
  for each row execute function public.bump_kreami_aggregates();

create or replace function public.touch_kreami_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger kreamis_touch_updated_at
  before update on public.kreamis
  for each row execute function public.touch_kreami_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.topics enable row level security;
alter table public.topic_aliases enable row level security;
alter table public.kreamis enable row level security;
alter table public.topic_resolution_log enable row level security;
alter table public.rate_limit_events enable row level security;

-- Anonymous read is deliberate: a shared topic link must work without an
-- account. That is the entire top of the funnel.
create policy topics_public_read on public.topics
  for select using (is_hidden = false);

create policy topic_aliases_public_read on public.topic_aliases
  for select using (true);

create policy kreamis_public_read on public.kreamis
  for select using (
    is_hidden = false
    and exists (
      select 1 from public.profiles p
       where p.id = kreamis.user_id and p.is_suspended = false
    )
  );

create policy kreamis_own_update on public.kreamis
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy kreamis_own_delete on public.kreamis
  for delete using (auth.uid() = user_id);

-- No insert policy on kreamis: writes go through post_kreami(), which is what
-- enforces rate limits and topic resolution.
-- No policies at all on topic_resolution_log or rate_limit_events: they are
-- unreachable from the client.

revoke all on public.topics from anon, authenticated;
revoke all on public.topic_aliases from anon, authenticated;
revoke all on public.kreamis from anon, authenticated;
revoke all on public.topic_resolution_log from anon, authenticated;
revoke all on public.rate_limit_events from anon, authenticated;

grant select on public.topics to anon, authenticated;
grant select on public.topic_aliases to anon, authenticated;
grant select on public.kreamis to anon, authenticated;
-- Editing your own Kreami is a plain update; only these two columns.
grant update (rating, note) on public.kreamis to authenticated;
grant delete on public.kreamis to authenticated;
