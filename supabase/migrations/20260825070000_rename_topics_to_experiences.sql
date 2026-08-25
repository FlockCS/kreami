-- Rename "topic" to "experience" throughout.
--
-- The product has always been about experiences — doc 01 opens with "a social
-- rating app for experiences" and the compose field already asks "What did you
-- experience?" — while the schema said "topic". Doc 02 calls the vocabulary
-- load-bearing, and this was the one place it had drifted.
--
-- Done now because it is as cheap as it will ever be: zero experiences exist,
-- no URLs have been shared, and the client does not reference these tables yet.
--
-- Functions are dropped and recreated rather than renamed: ALTER FUNCTION
-- RENAME would keep plpgsql bodies pointing at table names that no longer
-- exist, and those bodies are only resolved at runtime — so it would look fine
-- until the first call.

-- ---------------------------------------------------------------------------
-- Functions out of the way first (they depend on the tables)
-- ---------------------------------------------------------------------------

drop function if exists public.post_kreami(text, smallint, text);
drop function if exists public.resolve_topic(text);
drop function if exists public.create_topic(text);
drop function if exists public.search_topics(text, integer);
drop function if exists public.get_topic_by_slug(text);
drop function if exists public.topic_distribution(uuid);
drop function if exists public.merge_topics(uuid, uuid);
drop function if exists public.normalize_topic_title(text);

-- ---------------------------------------------------------------------------
-- Tables, columns, constraints, indexes, policies
-- ---------------------------------------------------------------------------

alter table public.topics rename to experiences;
alter table public.topic_aliases rename to experience_aliases;
alter table public.topic_resolution_log rename to experience_resolution_log;

alter table public.experiences rename column merged_into_topic_id to merged_into_experience_id;
alter table public.kreamis rename column topic_id to experience_id;
alter table public.experience_resolution_log rename column matched_topic_id to matched_experience_id;

alter table public.kreamis
  rename constraint kreamis_one_per_user_topic to kreamis_one_per_user_experience;

alter index public.topics_normalized_live_idx rename to experiences_normalized_live_idx;
alter index public.topics_normalized_trgm_idx rename to experiences_normalized_trgm_idx;
alter index public.topics_activity_idx rename to experiences_activity_idx;
alter index public.kreamis_topic_idx rename to kreamis_experience_idx;
alter index public.topic_resolution_log_created_idx
  rename to experience_resolution_log_created_idx;

alter policy topics_public_read on public.experiences rename to experiences_public_read;
alter policy topic_aliases_public_read on public.experience_aliases
  rename to experience_aliases_public_read;

-- ---------------------------------------------------------------------------
-- Functions, recreated
-- ---------------------------------------------------------------------------

create or replace function public.normalize_experience_title(raw text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select btrim(regexp_replace(lower(raw), '\s+', ' ', 'g'));
$$;

create or replace function public.recompute_experience_aggregates(target uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.experiences e
     set kreami_count = coalesce(agg.n, 0),
         rating_sum = coalesce(agg.total, 0)
    from (
      select count(*) as n, sum(rating) as total
        from public.kreamis
       where experience_id = target and is_hidden = false
    ) agg
   where e.id = target;
$$;

-- Replaced in place so the existing trigger binding survives.
create or replace function public.bump_kreami_aggregates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.experiences
       set kreami_count = kreami_count + 1, rating_sum = rating_sum + new.rating
     where id = new.experience_id;
    update public.profiles
       set kreami_count = kreami_count + 1
     where id = new.user_id;

  elsif tg_op = 'UPDATE' then
    if new.experience_id <> old.experience_id then
      perform public.recompute_experience_aggregates(old.experience_id);
      perform public.recompute_experience_aggregates(new.experience_id);
    elsif new.rating is distinct from old.rating then
      update public.experiences
         set rating_sum = rating_sum - old.rating + new.rating
       where id = new.experience_id;
    end if;

  elsif tg_op = 'DELETE' then
    update public.experiences
       set kreami_count = greatest(kreami_count - 1, 0),
           rating_sum = greatest(rating_sum - old.rating, 0)
     where id = old.experience_id;
    update public.profiles
       set kreami_count = greatest(kreami_count - 1, 0)
     where id = old.user_id;
  end if;

  return coalesce(new, old);
end $$;

drop function if exists public.recompute_topic_aggregates(uuid);

create or replace function public.create_experience(raw_title text)
returns public.experiences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean text := btrim(regexp_replace(raw_title, '\s+', ' ', 'g'));
  nq text := public.normalize_experience_title(raw_title);
  base text := public.slugify(clean);
  candidate text := base;
  suffix integer := 1;
  created public.experiences;
begin
  if char_length(clean) < 2 or char_length(clean) > 80 then
    raise exception 'Experience titles are 2 to 80 characters';
  end if;

  perform public.assert_rate_limit('create_experience', 10, interval '1 hour');

  for _attempt in 1..25 loop
    begin
      insert into public.experiences (title, normalized_title, slug, created_by)
      values (clean, nq, candidate, auth.uid())
      returning * into created;
      return created;
    exception when unique_violation then
      if exists (
        select 1 from public.experiences
         where normalized_title = nq and merged_into_experience_id is null
      ) then
        raise;
      end if;
      suffix := suffix + 1;
      candidate := base || '-' || suffix;
    end;
  end loop;

  raise exception 'Could not allocate a slug for %', clean;
end $$;

create or replace function public.resolve_experience(raw_title text)
returns table (experience_id uuid, matched_title text, is_new boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nq text := public.normalize_experience_title(raw_title);
  hit record;
  made public.experiences;
begin
  if char_length(nq) < 2 then
    raise exception 'Say a little more about the experience';
  end if;

  select e.id as id, e.title as title into hit
    from public.experiences e
   where e.normalized_title = nq and e.merged_into_experience_id is null;
  if found then
    insert into public.experience_resolution_log
      (raw_input, normalized, matched_experience_id, outcome, user_id)
    values (raw_title, nq, hit.id, 'exact', auth.uid());
    return query select hit.id, hit.title, false;
    return;
  end if;

  select e.id as id, e.title as title into hit
    from public.experience_aliases a
    join public.experiences e on e.id = a.experience_id
   where a.normalized_title = nq and e.merged_into_experience_id is null;
  if found then
    insert into public.experience_resolution_log
      (raw_input, normalized, matched_experience_id, outcome, user_id)
    values (raw_title, nq, hit.id, 'alias', auth.uid());
    return query select hit.id, hit.title, false;
    return;
  end if;

  select * into made from public.create_experience(raw_title);
  insert into public.experience_resolution_log
    (raw_input, normalized, matched_experience_id, outcome, user_id)
  values (raw_title, nq, made.id, 'new', auth.uid());
  return query select made.id, made.title, true;
end $$;

create or replace function public.post_kreami(
  raw_title text,
  rating smallint,
  note text default null
)
returns table (kreami_id uuid, experience_id uuid, experience_slug text, was_edit boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eid uuid;
  existing uuid;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if rating < 0 or rating > 5 then
    raise exception 'Rating must be 0-5';
  end if;
  if clean_note is not null and char_length(clean_note) > 150 then
    raise exception 'Notes are at most 150 characters';
  end if;

  perform public.assert_rate_limit('post_kreami', 30, interval '1 hour');

  select r.experience_id into eid from public.resolve_experience(raw_title) r;

  select k.id into existing
    from public.kreamis k
   where k.user_id = auth.uid() and k.experience_id = eid;

  if existing is not null then
    update public.kreamis k
       set rating = post_kreami.rating, note = clean_note
     where k.id = existing;
    return query
      select existing, eid, (select e.slug from public.experiences e where e.id = eid), true;
  else
    insert into public.kreamis (user_id, experience_id, rating, note)
    values (auth.uid(), eid, post_kreami.rating, clean_note)
    returning id into existing;
    return query
      select existing, eid, (select e.slug from public.experiences e where e.id = eid), false;
  end if;
end $$;

create or replace function public.search_experiences(q text, lim integer default 8)
returns table (
  id uuid,
  title text,
  slug text,
  kreami_count integer,
  avg_kreams numeric,
  score real
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with n as (select public.normalize_experience_title(q) as nq)
  select e.id,
         e.title,
         e.slug,
         e.kreami_count,
         case when e.kreami_count >= 3
              then round(e.rating_sum::numeric / e.kreami_count, 1)
         end,
         similarity(e.normalized_title, n.nq) as score
    from public.experiences e, n
   where e.merged_into_experience_id is null
     and e.is_hidden = false
     and char_length(n.nq) >= 2
     and e.normalized_title % n.nq
   order by score desc, e.kreami_count desc, e.created_at asc
   limit least(coalesce(lim, 8), 20);
$$;

create or replace function public.get_experience_by_slug(s text)
returns setof public.experiences
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.*
    from public.experiences t
    join public.experiences w on w.id = coalesce(t.merged_into_experience_id, t.id)
   where t.slug = s
     and w.is_hidden = false;
$$;

create or replace function public.experience_distribution(target uuid)
returns table (rating smallint, count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.rating::smallint,
         coalesce(count(k.id), 0)::integer
    from generate_series(0, 5) as g(rating)
    left join public.kreamis k
      on k.rating = g.rating and k.experience_id = target and k.is_hidden = false
   group by g.rating
   order by g.rating desc;
$$;

create or replace function public.merge_experiences(loser uuid, winner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  loser_norm text;
begin
  if loser = winner then
    raise exception 'Cannot merge an experience into itself';
  end if;

  select normalized_title into loser_norm from public.experiences where id = loser;
  if loser_norm is null then
    raise exception 'No such experience';
  end if;

  delete from public.kreamis k
   where k.experience_id = loser
     and exists (
       select 1 from public.kreamis k2
        where k2.experience_id = winner and k2.user_id = k.user_id
     );

  update public.kreamis set experience_id = winner where experience_id = loser;

  update public.experiences set merged_into_experience_id = winner where id = loser;

  insert into public.experience_aliases (normalized_title, experience_id)
  values (loser_norm, winner)
  on conflict (normalized_title) do update set experience_id = excluded.experience_id;

  update public.experience_aliases set experience_id = winner where experience_id = loser;

  perform public.recompute_experience_aggregates(winner);
  perform public.recompute_experience_aggregates(loser);
end $$;

-- ---------------------------------------------------------------------------
-- Grants. `revoke ... from public` alone does not remove anon's access on
-- Supabase — see docs/09.
-- ---------------------------------------------------------------------------

revoke execute on function public.normalize_experience_title(text) from public, anon, authenticated;
revoke execute on function public.recompute_experience_aggregates(uuid) from public, anon, authenticated;
revoke execute on function public.create_experience(text) from public, anon, authenticated;
revoke execute on function public.resolve_experience(text) from public, anon, authenticated;
revoke execute on function public.merge_experiences(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.post_kreami(text, smallint, text) from public, anon;
revoke execute on function public.search_experiences(text, integer) from public;
revoke execute on function public.get_experience_by_slug(text) from public;
revoke execute on function public.experience_distribution(uuid) from public;

grant execute on function public.post_kreami(text, smallint, text) to authenticated;
grant execute on function public.search_experiences(text, integer) to anon, authenticated;
grant execute on function public.get_experience_by_slug(text) to anon, authenticated;
grant execute on function public.experience_distribution(uuid) to anon, authenticated;

grant select on public.experiences to anon, authenticated;
grant select on public.experience_aliases to anon, authenticated;
