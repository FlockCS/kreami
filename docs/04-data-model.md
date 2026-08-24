# 04 — Data Model

Postgres 15 on Supabase. Schema is the source of truth; TypeScript types are generated from
it. All SQL below is illustrative but close to production-ready.

## Extensions

```sql
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;    -- trigram similarity for topic matching
create extension if not exists unaccent;   -- available, but NOT used by normalization
-- pgvector: NOT enabled in v1. See doc 05 for when it becomes worth it.
```

## Core tables

### profiles

Mirrors `auth.users`. **The app never queries `auth.users` directly** — that's the
portability rule from [03](03-architecture.md). Everything joins to `profiles`.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  handle        text not null unique
                check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null check (char_length(display_name) between 1 and 40),
  bio           text check (char_length(bio) <= 160),
  avatar_url    text,
  kreami_count  integer not null default 0,
  follower_count  integer not null default 0,
  following_count integer not null default 0,
  is_suspended  boolean not null default false,
  created_at    timestamptz not null default now()
);

create unique index profiles_handle_lower_idx on profiles (lower(handle));
```

Handle collisions with reserved words are blocked by a trigger, not a check constraint,
so the reserved list can change without a migration:

```sql
create table reserved_handles (handle text primary key);
insert into reserved_handles values
  ('admin'),('kreami'),('kream'),('about'),('settings'),('api'),
  ('search'),('feed'),('discover'),('login'),('signup'),('help'),('support'),
  ('t'),('u'),('k');
```

### topics

The spine. See [05 — Topic Matching](05-topic-matching.md) for how rows get here.

```sql
create table topics (
  id                  uuid primary key default uuid_generate_v4(),
  title               text not null check (char_length(title) between 2 and 80),
  normalized_title    text not null,
  slug                text not null unique,
  created_by          uuid references profiles(id) on delete set null,
  kreami_count        integer not null default 0,
  rating_sum          integer not null default 0,
  merged_into_topic_id uuid references topics(id),
  is_hidden           boolean not null default false,  -- moderation
  created_at          timestamptz not null default now()
);

-- Exactly one live topic per normalized string.
create unique index topics_normalized_live_idx
  on topics (normalized_title)
  where merged_into_topic_id is null;

-- Trigram index: powers autocomplete and the duplicate-candidate report.
-- Resolution itself is exact-match only and uses the unique index above.
create index topics_normalized_trgm_idx
  on topics using gin (normalized_title gin_trgm_ops);

-- Discovery: most-rated topics, recently active.
create index topics_activity_idx
  on topics (kreami_count desc, created_at desc)
  where merged_into_topic_id is null and is_hidden = false;
```

**Average is computed, never stored:**

```sql
create or replace function topic_average(t topics) returns numeric
language sql immutable as $$
  select case when t.kreami_count >= 3
    then round(t.rating_sum::numeric / t.kreami_count, 1)
    else null end;
$$;
```

Returning `null` below 3 Kreamis is intentional — the UI shows "Not enough Kreamis yet"
rather than a misleading 5.0 from a single rating.

### topic_aliases

Makes merges non-destructive. Old phrasings keep resolving forever.

```sql
create table topic_aliases (
  normalized_title text primary key,
  topic_id         uuid not null references topics(id) on delete cascade,
  created_at       timestamptz not null default now()
);
```

**Invariant:** a string is never both a live `topics.normalized_title` and a
`topic_aliases.normalized_title`. Enforced in the merge function, which inserts the alias in
the same transaction that sets `merged_into_topic_id`.

### kreamis

```sql
create table kreamis (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  topic_id    uuid not null references topics(id) on delete cascade,
  rating      smallint not null check (rating between 0 and 5),
  note        text check (char_length(note) <= 150),
  like_count  integer not null default 0,
  reply_count integer not null default 0,
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One Kreami per user per topic. Re-posting edits.
  constraint kreamis_one_per_user_topic unique (user_id, topic_id)
);

create index kreamis_topic_idx  on kreamis (topic_id, created_at desc)
  where is_hidden = false;
create index kreamis_user_idx   on kreamis (user_id, created_at desc)
  where is_hidden = false;
-- The home feed's workhorse index.
create index kreamis_feed_idx   on kreamis (created_at desc, user_id)
  where is_hidden = false;
```

**On `rating smallint`:** whole Kreams 0–5, as decided. If halves are ever wanted, the
migration is a single `update kreamis set rating = rating * 2` plus a widened check
constraint and a display divisor — an hour of work, not a rewrite. Noted so the decision
stays reversible.

### follows

```sql
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

-- Reverse lookup for follower lists.
create index follows_followee_idx on follows (followee_id, created_at desc);
```

### likes and replies

```sql
create table likes (
  user_id    uuid not null references profiles(id) on delete cascade,
  kreami_id  uuid not null references kreamis(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, kreami_id)
);

create table replies (
  id         uuid primary key default uuid_generate_v4(),
  kreami_id  uuid not null references kreamis(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 150),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);

create index replies_kreami_idx on replies (kreami_id, created_at) where is_hidden = false;
```

Replies are **one level deep**. There is no `parent_reply_id` and there will not be one.

### notifications

```sql
create type notification_kind as enum
  ('new_follower','kreami_liked','kreami_replied','topic_activity');

create table notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,  -- recipient
  actor_id   uuid references profiles(id) on delete cascade,
  kind       notification_kind not null,
  kreami_id  uuid references kreamis(id) on delete cascade,
  topic_id   uuid references topics(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
```

Generated by triggers. Self-actions never generate one (liking your own Kreami is silent).

### reports

```sql
create type report_reason as enum
  ('spam','harassment','hate','sexual','violence','duplicate_topic','other');

create table reports (
  id          uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      report_reason not null,
  detail      text check (char_length(detail) <= 300),
  kreami_id   uuid references kreamis(id) on delete cascade,
  reply_id    uuid references replies(id) on delete cascade,
  topic_id    uuid references topics(id) on delete cascade,
  target_user_id uuid references profiles(id) on delete cascade,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint exactly_one_target check (
    (kreami_id is not null)::int + (reply_id is not null)::int +
    (topic_id is not null)::int + (target_user_id is not null)::int = 1
  )
);
```

## Counter triggers

Every denormalized count is trigger-maintained, never application-maintained. Application
code that forgets to decrement a counter produces drift you'll be reconciling for years.

```sql
create or replace function bump_topic_aggregates() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update topics set kreami_count = kreami_count + 1,
                      rating_sum   = rating_sum + new.rating
      where id = new.topic_id;
    update profiles set kreami_count = kreami_count + 1 where id = new.user_id;
  elsif tg_op = 'UPDATE' and old.rating is distinct from new.rating then
    update topics set rating_sum = rating_sum - old.rating + new.rating
      where id = new.topic_id;
  elsif tg_op = 'DELETE' then
    update topics set kreami_count = kreami_count - 1,
                      rating_sum   = rating_sum - old.rating
      where id = old.topic_id;
    update profiles set kreami_count = kreami_count - 1 where id = old.user_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger kreamis_aggregates
  after insert or update or delete on kreamis
  for each row execute function bump_topic_aggregates();
```

Equivalent triggers exist for `likes → kreamis.like_count`,
`replies → kreamis.reply_count`, and `follows → profiles.follower_count/following_count`.

**Run a nightly reconciliation job** (GitHub Actions, free) that recomputes every counter
from source and logs discrepancies. Triggers drift under concurrent load and manual fixes;
you want to find out from a log line, not from a user.

## Row Level Security

RLS is on for every table, with **no exceptions**. Full policy set in
[09 — Security & Moderation](09-security-moderation.md); the shape is:

```sql
alter table kreamis enable row level security;

-- Anyone (signed in or not) reads non-hidden Kreamis by non-suspended users.
create policy kreamis_public_read on kreamis for select
  using (
    is_hidden = false
    and exists (select 1 from profiles p
                where p.id = kreamis.user_id and p.is_suspended = false)
  );

-- You write only your own.
create policy kreamis_own_insert on kreamis for insert
  with check (auth.uid() = user_id);
create policy kreamis_own_update on kreamis for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kreamis_own_delete on kreamis for delete
  using (auth.uid() = user_id);
```

**Anonymous read access is deliberate.** A shared Topic link must work for someone without
an account — that's the entire top of the funnel. The `anon` role gets `select` on public
data and nothing else.

## What the schema does not have

- No `categories` or `tags` table. See [02](02-domain-model.md) for why.
- No `places`, `products`, or any typed entity. A Topic is a string.
- No `photos` / media table in v1. Storage holds avatars only.
- No `feed_entries` table yet — feeds are computed on read until they can't be. See
  [06](06-feeds-and-social.md) for the exact migration when that day comes.
