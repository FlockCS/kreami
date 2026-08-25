-- Phase 3: follows, likes, replies and the feeds.
-- See docs/06-feeds-and-social.md.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, created_at desc);

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kreami_id uuid not null references public.kreamis (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, kreami_id)
);

create index likes_kreami_idx on public.likes (kreami_id);

-- One level deep, deliberately. There is no parent_reply_id and there will not
-- be one: it removes a whole class of UI and moderation complexity.
create table public.replies (
  id uuid primary key default gen_random_uuid(),
  kreami_id uuid not null references public.kreamis (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 150),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index replies_kreami_idx on public.replies (kreami_id, created_at)
  where is_hidden = false;

-- ---------------------------------------------------------------------------
-- Counters, trigger-maintained
-- ---------------------------------------------------------------------------

create or replace function public.bump_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles
       set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
    update public.profiles
       set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger follows_counts
  after insert or delete on public.follows
  for each row execute function public.bump_follow_counts();

create or replace function public.bump_like_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.kreamis set like_count = like_count + 1 where id = new.kreami_id;
  elsif tg_op = 'DELETE' then
    update public.kreamis
       set like_count = greatest(like_count - 1, 0) where id = old.kreami_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger likes_count
  after insert or delete on public.likes
  for each row execute function public.bump_like_count();

create or replace function public.bump_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.kreamis set reply_count = reply_count + 1 where id = new.kreami_id;
  elsif tg_op = 'DELETE' then
    update public.kreamis
       set reply_count = greatest(reply_count - 1, 0) where id = old.kreami_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger replies_count
  after insert or delete on public.replies
  for each row execute function public.bump_reply_count();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.follows enable row level security;
alter table public.likes enable row level security;
alter table public.replies enable row level security;

create policy follows_public_read on public.follows for select using (true);
create policy likes_public_read on public.likes for select using (true);

create policy replies_public_read on public.replies
  for select using (
    is_hidden = false
    and exists (
      select 1 from public.profiles p where p.id = replies.user_id and p.is_suspended = false
    )
  );

create policy replies_own_delete on public.replies
  for delete using (auth.uid() = user_id);

-- No insert policies: follows and likes go through their toggle functions,
-- which is where the rate limits live, and replies through post_reply().

revoke all on public.follows from anon, authenticated;
revoke all on public.likes from anon, authenticated;
revoke all on public.replies from anon, authenticated;

grant select on public.follows to anon, authenticated;
grant select on public.likes to anon, authenticated;
grant select on public.replies to anon, authenticated;
grant delete on public.replies to authenticated;

-- ---------------------------------------------------------------------------
-- Toggles — idempotent, one round trip, no read-then-write race
-- ---------------------------------------------------------------------------

create or replace function public.toggle_follow(target uuid)
returns table (following boolean, follower_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if target = auth.uid() then raise exception 'You cannot follow yourself'; end if;

  select true into existed
    from public.follows
   where follower_id = auth.uid() and followee_id = target;

  if existed then
    delete from public.follows
     where follower_id = auth.uid() and followee_id = target;
  else
    -- Mass-follow is the cheapest growth-spam pattern there is.
    perform public.assert_rate_limit('follow', 100, interval '1 hour');
    insert into public.follows (follower_id, followee_id)
    values (auth.uid(), target)
    on conflict do nothing;
  end if;

  return query
    select not coalesce(existed, false),
           (select p.follower_count from public.profiles p where p.id = target);
end $$;

create or replace function public.toggle_like(target uuid)
returns table (liked boolean, like_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select true into existed
    from public.likes where user_id = auth.uid() and kreami_id = target;

  if existed then
    delete from public.likes where user_id = auth.uid() and kreami_id = target;
  else
    perform public.assert_rate_limit('like', 300, interval '1 hour');
    insert into public.likes (user_id, kreami_id) values (auth.uid(), target)
    on conflict do nothing;
  end if;

  return query
    select not coalesce(existed, false),
           (select k.like_count from public.kreamis k where k.id = target);
end $$;

create or replace function public.post_reply(target uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean text := btrim(coalesce(body, ''));
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if char_length(clean) = 0 then raise exception 'Say something'; end if;
  if char_length(clean) > 150 then raise exception 'Replies are at most 150 characters'; end if;

  perform public.assert_rate_limit('reply', 60, interval '1 hour');

  insert into public.replies (kreami_id, user_id, body)
  values (target, auth.uid(), clean)
  returning id into new_id;

  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Feeds — fan-out-on-read. One query against the follow graph, no
-- precomputation. When this stops being fast enough the fix is a materialised
-- feed_entries table and the CLIENT DOES NOT CHANGE, because it only ever
-- calls this function by name. See docs/06.
-- ---------------------------------------------------------------------------

create or replace function public.home_feed(
  before timestamptz default null,
  lim integer default 20
)
returns table (
  kreami_id uuid,
  rating smallint,
  note text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
  liked_by_me boolean,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  experience_id uuid,
  experience_title text,
  experience_slug text,
  experience_avg numeric,
  experience_kreami_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select k.id, k.rating, k.note, k.created_at,
         k.like_count, k.reply_count,
         exists (select 1 from public.likes l
                  where l.kreami_id = k.id and l.user_id = auth.uid()),
         p.id, p.handle, p.display_name, p.avatar_url,
         e.id, e.title, e.slug,
         case when e.kreami_count >= 3
              then round(e.rating_sum::numeric / e.kreami_count, 1) end,
         e.kreami_count
    from public.kreamis k
    join public.profiles p on p.id = k.user_id
    join public.experiences e on e.id = k.experience_id
   where k.is_hidden = false
     and p.is_suspended = false
     and p.handle is not null
     -- Your own Kreamis are included: a brand-new account that follows nobody
     -- still sees its first post land, which makes the app feel alive at once.
     and (k.user_id = auth.uid()
          or k.user_id in (select f.followee_id from public.follows f
                            where f.follower_id = auth.uid()))
     and (before is null or k.created_at < before)
   order by k.created_at desc
   limit least(coalesce(lim, 20), 50);
$$;

create or replace function public.global_feed(
  before timestamptz default null,
  lim integer default 20
)
returns table (
  kreami_id uuid,
  rating smallint,
  note text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
  liked_by_me boolean,
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  experience_id uuid,
  experience_title text,
  experience_slug text,
  experience_avg numeric,
  experience_kreami_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select k.id, k.rating, k.note, k.created_at,
         k.like_count, k.reply_count,
         exists (select 1 from public.likes l
                  where l.kreami_id = k.id and l.user_id = auth.uid()),
         p.id, p.handle, p.display_name, p.avatar_url,
         e.id, e.title, e.slug,
         case when e.kreami_count >= 3
              then round(e.rating_sum::numeric / e.kreami_count, 1) end,
         e.kreami_count
    from public.kreamis k
    join public.profiles p on p.id = k.user_id
    join public.experiences e on e.id = k.experience_id
   where k.is_hidden = false
     and p.is_suspended = false
     and p.handle is not null
     and (before is null or k.created_at < before)
   order by k.created_at desc
   limit least(coalesce(lim, 20), 50);
$$;

-- Discovery: what has been rated most in the last week. Aggregates over the
-- whole table, which is fine at this size and becomes a materialised view
-- refreshed hourly when it is not. See docs/06.
create or replace function public.active_experiences(lim integer default 20)
returns table (
  id uuid,
  title text,
  slug text,
  kreami_count integer,
  avg_kreams numeric,
  recent_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.title, e.slug, e.kreami_count,
         case when e.kreami_count >= 3
              then round(e.rating_sum::numeric / e.kreami_count, 1) end,
         count(k.id) filter (where k.created_at > now() - interval '7 days')::integer
    from public.experiences e
    left join public.kreamis k on k.experience_id = e.id and k.is_hidden = false
   where e.merged_into_experience_id is null and e.is_hidden = false
   group by e.id
  having count(k.id) > 0
   order by count(k.id) filter (where k.created_at > now() - interval '7 days') desc,
            e.kreami_count desc
   limit least(coalesce(lim, 20), 50);
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from anon BY NAME — see docs/09.
-- ---------------------------------------------------------------------------

revoke execute on function public.toggle_follow(uuid) from public, anon;
revoke execute on function public.toggle_like(uuid) from public, anon;
revoke execute on function public.post_reply(uuid, text) from public, anon;
revoke execute on function public.home_feed(timestamptz, integer) from public, anon;
revoke execute on function public.global_feed(timestamptz, integer) from public;
revoke execute on function public.active_experiences(integer) from public;

grant execute on function public.toggle_follow(uuid) to authenticated;
grant execute on function public.toggle_like(uuid) to authenticated;
grant execute on function public.post_reply(uuid, text) to authenticated;
grant execute on function public.home_feed(timestamptz, integer) to authenticated;

-- Logged-out visitors get discovery: that is the top of the funnel.
grant execute on function public.global_feed(timestamptz, integer) to anon, authenticated;
grant execute on function public.active_experiences(integer) to anon, authenticated;
