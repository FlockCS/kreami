-- Follower and following lists — the last piece of Phase 3.
--
-- Two functions rather than a direct PostgREST query on `follows`, for the
-- same reason as public_profile(): the row a list needs is a *profile* joined
-- through an edge, plus "do I follow this person" computed for the viewer.
-- PostgREST can embed the profile, but it cannot answer the last part without
-- a second round trip per screen and a client-side merge.
--
-- Both are readable by anon: profiles and follow edges are already publicly
-- readable (docs/04), and a shared profile link must work without an account.
-- `is_following` is simply false for a caller with no session.

-- The reverse direction already has follows_followee_idx. This is the forward
-- one: the primary key (follower_id, followee_id) can find a person's
-- follows, but not in created_at order without a sort.
create index if not exists follows_follower_idx
  on public.follows (follower_id, created_at desc);

-- Who follows `target`, most recent first.
--
-- The keyset cursor is follows.created_at, which is not unique. Two follows
-- landing in the same microsecond would put one of them on a page boundary
-- where it could be skipped. Accepted: nothing bulk-inserts follow edges, and
-- the alternative is a composite cursor for a list almost nobody pages.
create or replace function public.profile_followers(
  target uuid,
  before timestamptz default null,
  lim integer default 30
)
returns table (
  id uuid,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  follower_count integer,
  followed_at timestamptz,
  is_following boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.handle, p.display_name, p.bio, p.avatar_url, p.follower_count,
         f.created_at,
         exists (select 1 from public.follows viewer
                  where viewer.follower_id = auth.uid() and viewer.followee_id = p.id),
         -- coalesce, not a bare comparison: `id = auth.uid()` is NULL for a
         -- logged-out caller, and a nullable boolean where the type says
         -- boolean is a bug waiting for whoever writes `!is_self`.
         coalesce(p.id = auth.uid(), false)
    from public.follows f
    join public.profiles p on p.id = f.follower_id
   where f.followee_id = target
     and p.is_suspended = false
     and p.handle is not null
     and (before is null or f.created_at < before)
   order by f.created_at desc
   limit least(coalesce(lim, 30), 50);
$$;

-- Who `target` follows, most recently followed first.
create or replace function public.profile_following(
  target uuid,
  before timestamptz default null,
  lim integer default 30
)
returns table (
  id uuid,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  follower_count integer,
  followed_at timestamptz,
  is_following boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.handle, p.display_name, p.bio, p.avatar_url, p.follower_count,
         f.created_at,
         exists (select 1 from public.follows viewer
                  where viewer.follower_id = auth.uid() and viewer.followee_id = p.id),
         -- coalesce, not a bare comparison: `id = auth.uid()` is NULL for a
         -- logged-out caller, and a nullable boolean where the type says
         -- boolean is a bug waiting for whoever writes `!is_self`.
         coalesce(p.id = auth.uid(), false)
    from public.follows f
    join public.profiles p on p.id = f.followee_id
   where f.follower_id = target
     and p.is_suspended = false
     and p.handle is not null
     and (before is null or f.created_at < before)
   order by f.created_at desc
   limit least(coalesce(lim, 30), 50);
$$;

revoke execute on function public.profile_followers(uuid, timestamptz, integer) from public;
revoke execute on function public.profile_following(uuid, timestamptz, integer) from public;

grant execute on function public.profile_followers(uuid, timestamptz, integer)
  to anon, authenticated;
grant execute on function public.profile_following(uuid, timestamptz, integer)
  to anon, authenticated;
