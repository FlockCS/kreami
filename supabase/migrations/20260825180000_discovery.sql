-- Phase 4: finding people.
--
-- Two functions, for the two ways a new account meets somebody: searching for
-- a name they already know, and being handed a list when they know nobody.

-- ---------------------------------------------------------------------------
-- search_profiles
--
-- This replaces a client-side PostgREST filter built by string interpolation:
--
--   .or(`handle.ilike.%${q}%,display_name.ilike.%${q}%`)
--
-- In PostgREST's filter grammar a comma separates disjuncts and parentheses
-- group them, so a query containing either was not escaped — it was parsed.
-- Searching for "a,b" changed the shape of the filter rather than looking for
-- that string. RLS bounds the damage to rows already publicly readable, so
-- this was a correctness bug rather than a leak, but the fix is the same:
-- take the search term as a parameter instead of building syntax out of it.
--
-- Ordering puts exact and prefix handle matches first, because somebody typing
-- a handle they already know should not have to scroll past coincidences.
create or replace function public.search_profiles(q text, lim integer default 10)
returns table (
  id uuid,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  follower_count integer,
  is_following boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with term as (select btrim(coalesce(q, '')) as raw)
  select p.id, p.handle, p.display_name, p.bio, p.avatar_url, p.follower_count,
         exists (select 1 from public.follows f
                  where f.follower_id = auth.uid() and f.followee_id = p.id),
         coalesce(p.id = auth.uid(), false)
    from public.profiles p, term
   where char_length(term.raw) >= 2
     and p.handle is not null
     and p.is_suspended = false
     and (p.handle ilike '%' || term.raw || '%' or p.display_name ilike '%' || term.raw || '%')
   order by
     (lower(p.handle) = lower(term.raw)) desc,
     (p.handle ilike term.raw || '%') desc,
     (p.display_name ilike term.raw || '%') desc,
     p.follower_count desc,
     p.handle
   limit least(coalesce(lim, 10), 25);
$$;

-- ---------------------------------------------------------------------------
-- suggested_profiles
--
-- Hand-curated, deliberately. docs/06 is explicit that v1 does not build
-- recommendation logic: with no usage data there is nothing to recommend from,
-- and a bad suggestion at onboarding is worse than a short list.
-- ---------------------------------------------------------------------------

create table public.suggested_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- Why this person is worth following, shown under their name. Null falls
  -- back to their own bio.
  reason text check (char_length(reason) <= 80),
  -- Lower sorts first. Ties break on follower count.
  rank integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.suggested_profiles enable row level security;

-- No policies and no grants: the table is admin-only, edited in the SQL
-- editor, and read exclusively through the function below. There is no admin
-- surface yet (BACKLOG) and this is small enough not to need one.
revoke all on public.suggested_profiles from anon, authenticated;

-- Who to follow when you follow nobody.
--
-- Excludes anyone you already follow and yourself, so the list shrinks as you
-- use it rather than showing the same names with the button already pressed.
create or replace function public.suggested_profiles(lim integer default 10)
returns table (
  id uuid,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  follower_count integer,
  reason text,
  is_following boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.handle, p.display_name, p.bio, p.avatar_url, p.follower_count,
         s.reason,
         false,
         false
    from public.suggested_profiles s
    join public.profiles p on p.id = s.profile_id
   where p.handle is not null
     and p.is_suspended = false
     and p.id is distinct from auth.uid()
     and not exists (
       select 1 from public.follows f
        where f.follower_id = auth.uid() and f.followee_id = p.id
     )
   order by s.rank, p.follower_count desc
   limit least(coalesce(lim, 10), 25);
$$;

revoke execute on function public.search_profiles(text, integer) from public;
revoke execute on function public.suggested_profiles(integer) from public, anon;

-- Searching people is part of the logged-out funnel, same as global_feed.
grant execute on function public.search_profiles(text, integer) to anon, authenticated;
grant execute on function public.suggested_profiles(integer) to authenticated;
