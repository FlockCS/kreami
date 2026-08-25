-- The profile header, in one call.
--
-- "Average Kream given" is the personality stat (docs/08): a 4.6 is somebody
-- who loves everything, a 1.8 is somebody whose 5/5 means something. It is an
-- aggregate over the person's Kreamis, so it cannot come from a column and
-- PostgREST will not compute it — hence a function.
--
-- Suspended and un-onboarded accounts return nothing, matching the RLS on
-- profiles rather than leaking their existence.

create or replace function public.public_profile(target_handle text)
returns table (
  id uuid,
  handle text,
  display_name text,
  bio text,
  avatar_url text,
  kreami_count integer,
  follower_count integer,
  following_count integer,
  avg_kream_given numeric,
  is_following boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.handle, p.display_name, p.bio, p.avatar_url,
         p.kreami_count, p.follower_count, p.following_count,
         (select round(avg(k.rating), 1)
            from public.kreamis k
           where k.user_id = p.id and k.is_hidden = false),
         exists (select 1 from public.follows f
                  where f.follower_id = auth.uid() and f.followee_id = p.id),
         p.id = auth.uid()
    from public.profiles p
   where lower(p.handle) = lower(btrim(target_handle))
     and p.is_suspended = false
     and p.handle is not null;
$$;

-- Somebody's Kreamis, with the experience attached. Ordered by the caller.
create or replace function public.profile_kreamis(
  target uuid,
  sort text default 'recent',
  lim integer default 30
)
returns table (
  kreami_id uuid,
  rating smallint,
  note text,
  created_at timestamptz,
  like_count integer,
  reply_count integer,
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
  select k.id, k.rating, k.note, k.created_at, k.like_count, k.reply_count,
         e.id, e.title, e.slug,
         case when e.kreami_count >= 3
              then round(e.rating_sum::numeric / e.kreami_count, 1) end,
         e.kreami_count
    from public.kreamis k
    join public.experiences e on e.id = k.experience_id
    join public.profiles p on p.id = k.user_id
   where k.user_id = target
     and k.is_hidden = false
     and p.is_suspended = false
   order by
     case when sort = 'highest' then k.rating end desc nulls last,
     case when sort = 'lowest' then k.rating end asc nulls last,
     k.created_at desc
   limit least(coalesce(lim, 30), 50);
$$;

revoke execute on function public.public_profile(text) from public;
revoke execute on function public.profile_kreamis(uuid, text, integer) from public;

grant execute on function public.public_profile(text) to anon, authenticated;
grant execute on function public.profile_kreamis(uuid, text, integer) to anon, authenticated;
