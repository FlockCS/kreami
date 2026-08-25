-- Phase 2: the matching pipeline. See docs/05-topic-matching.md.
--
-- Design note that differs from doc 05's sketch: resolve_topic() is INTERNAL.
-- It is granted to nobody, and only post_kreami() calls it. If the client could
-- call it directly, previewing a title would create a topic with zero Kreamis —
-- exactly the lonely-topic pollution the whole matching design exists to avoid.
-- A topic should never exist without at least one rating on it.

-- ---------------------------------------------------------------------------
-- create_topic
-- ---------------------------------------------------------------------------

create or replace function public.create_topic(raw_title text)
returns public.topics
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean text := btrim(regexp_replace(raw_title, '\s+', ' ', 'g'));
  nq text := public.normalize_topic_title(raw_title);
  base text := public.slugify(clean);
  candidate text := base;
  suffix integer := 1;
  created public.topics;
begin
  if char_length(clean) < 2 or char_length(clean) > 80 then
    raise exception 'Topic titles are 2 to 80 characters';
  end if;

  perform public.assert_rate_limit('create_topic', 10, interval '1 hour');

  -- Slugs are derived with punctuation stripped, so two genuinely different
  -- topics ("jury duty" and "jury duty!") can want the same slug. Retry with a
  -- numbered suffix; a normalized_title collision is a different matter and is
  -- re-raised for the caller to resolve as a join.
  for _attempt in 1..25 loop
    begin
      insert into public.topics (title, normalized_title, slug, created_by)
      values (clean, nq, candidate, auth.uid())
      returning * into created;
      return created;
    exception when unique_violation then
      if exists (
        select 1 from public.topics
         where normalized_title = nq and merged_into_topic_id is null
      ) then
        raise;
      end if;
      suffix := suffix + 1;
      candidate := base || '-' || suffix;
    end;
  end loop;

  raise exception 'Could not allocate a slug for %', clean;
end $$;

-- ---------------------------------------------------------------------------
-- resolve_topic — exact match, or a new topic. No guessing, no confirmation.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_topic(raw_title text)
returns table (topic_id uuid, matched_title text, is_new boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nq text := public.normalize_topic_title(raw_title);
  hit record;
  made public.topics;
begin
  if char_length(nq) < 2 then
    raise exception 'Say a little more about the experience';
  end if;

  -- 1. Exact match on a live topic.
  select t.id as id, t.title as title into hit
    from public.topics t
   where t.normalized_title = nq and t.merged_into_topic_id is null;
  if found then
    insert into public.topic_resolution_log (raw_input, normalized, matched_topic_id, outcome, user_id)
    values (raw_title, nq, hit.id, 'exact', auth.uid());
    return query select hit.id, hit.title, false;
    return;
  end if;

  -- 2. Exact match on a phrasing merged away earlier. This is what makes
  --    merging compound: each merge teaches the system one more spelling.
  select t.id as id, t.title as title into hit
    from public.topic_aliases a
    join public.topics t on t.id = a.topic_id
   where a.normalized_title = nq and t.merged_into_topic_id is null;
  if found then
    insert into public.topic_resolution_log (raw_input, normalized, matched_topic_id, outcome, user_id)
    values (raw_title, nq, hit.id, 'alias', auth.uid());
    return query select hit.id, hit.title, false;
    return;
  end if;

  -- 3. Anything else is a new topic.
  select * into made from public.create_topic(raw_title);
  insert into public.topic_resolution_log (raw_input, normalized, matched_topic_id, outcome, user_id)
  values (raw_title, nq, made.id, 'new', auth.uid());
  return query select made.id, made.title, true;
end $$;

-- ---------------------------------------------------------------------------
-- post_kreami — the single write that matters
-- ---------------------------------------------------------------------------

create or replace function public.post_kreami(
  raw_title text,
  rating smallint,
  note text default null
)
returns table (kreami_id uuid, topic_id uuid, topic_slug text, was_edit boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tid uuid;
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

  -- Resolution and the write happen in one transaction. Two calls would risk
  -- creating a topic and then failing to rate it.
  select r.topic_id into tid from public.resolve_topic(raw_title) r;

  select k.id into existing
    from public.kreamis k
   where k.user_id = auth.uid() and k.topic_id = tid;

  if existing is not null then
    update public.kreamis k
       set rating = post_kreami.rating, note = clean_note
     where k.id = existing;
    return query
      select existing, tid, (select t.slug from public.topics t where t.id = tid), true;
  else
    insert into public.kreamis (user_id, topic_id, rating, note)
    values (auth.uid(), tid, post_kreami.rating, clean_note)
    returning id into existing;
    return query
      select existing, tid, (select t.slug from public.topics t where t.id = tid), false;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Search-as-you-type. Under the exact-match rule this is the ONLY thing that
-- steers people into an existing thread before a duplicate exists, so it is
-- generous on purpose: being shown an option you ignore costs nothing, not
-- being shown the right thread costs a permanent duplicate.
create or replace function public.search_topics(q text, lim integer default 8)
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
  with n as (select public.normalize_topic_title(q) as nq)
  select t.id,
         t.title,
         t.slug,
         t.kreami_count,
         case when t.kreami_count >= 3
              then round(t.rating_sum::numeric / t.kreami_count, 1)
         end,
         similarity(t.normalized_title, n.nq) as score
    from public.topics t, n
   where t.merged_into_topic_id is null
     and t.is_hidden = false
     and char_length(n.nq) >= 2
     and t.normalized_title % n.nq
   order by score desc,
            -- Popular threads win ties. This gravity well is the main force
            -- fighting fragmentation, so do not weaken it.
            t.kreami_count desc,
            t.created_at asc
   limit least(coalesce(lim, 8), 20);
$$;

-- Old links must keep working: a merged topic quietly resolves to its winner.
create or replace function public.get_topic_by_slug(s text)
returns public.topics
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(w.*, t.*)
    from public.topics t
    left join public.topics w on w.id = t.merged_into_topic_id
   where t.slug = s and t.is_hidden = false;
$$;

-- Six rows, always, including the ratings nobody gave. A histogram with missing
-- bars misreads as missing data rather than as zero.
create or replace function public.topic_distribution(target uuid)
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
      on k.rating = g.rating and k.topic_id = target and k.is_hidden = false
   group by g.rating
   order by g.rating desc;
$$;

-- ---------------------------------------------------------------------------
-- Merging — admin only, and the only repair the exact-match rule has
-- ---------------------------------------------------------------------------

create or replace function public.merge_topics(loser uuid, winner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  loser_norm text;
begin
  if loser = winner then
    raise exception 'Cannot merge a topic into itself';
  end if;

  select normalized_title into loser_norm from public.topics where id = loser;
  if loser_norm is null then
    raise exception 'No such topic';
  end if;

  -- A person who rated both keeps their rating on the winning topic.
  delete from public.kreamis k
   where k.topic_id = loser
     and exists (
       select 1 from public.kreamis k2
        where k2.topic_id = winner and k2.user_id = k.user_id
     );

  update public.kreamis set topic_id = winner where topic_id = loser;

  update public.topics set merged_into_topic_id = winner where id = loser;

  insert into public.topic_aliases (normalized_title, topic_id)
  values (loser_norm, winner)
  on conflict (normalized_title) do update set topic_id = excluded.topic_id;

  update public.topic_aliases set topic_id = winner where topic_id = loser;

  perform public.recompute_topic_aggregates(winner);
  perform public.recompute_topic_aggregates(loser);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- `revoke ... from public` alone does NOT remove anon's access on Supabase:
-- default privileges grant EXECUTE to anon and authenticated directly. Every
-- function must be revoked from anon by name. See docs/09.
-- ---------------------------------------------------------------------------

revoke execute on function public.normalize_topic_title(text) from public, anon;
revoke execute on function public.slugify(text) from public, anon;
revoke execute on function public.assert_rate_limit(text, integer, interval) from public, anon, authenticated;
revoke execute on function public.recompute_topic_aggregates(uuid) from public, anon, authenticated;
revoke execute on function public.create_topic(text) from public, anon, authenticated;
revoke execute on function public.resolve_topic(text) from public, anon, authenticated;
revoke execute on function public.merge_topics(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.post_kreami(text, smallint, text) from public, anon;
revoke execute on function public.search_topics(text, integer) from public;
revoke execute on function public.get_topic_by_slug(text) from public;
revoke execute on function public.topic_distribution(uuid) from public;

-- Only post_kreami is a client write, and it is the only path to a new topic.
grant execute on function public.post_kreami(text, smallint, text) to authenticated;

-- Reads stay open to anonymous visitors: a shared link has to work.
grant execute on function public.search_topics(text, integer) to anon, authenticated;
grant execute on function public.get_topic_by_slug(text) to anon, authenticated;
grant execute on function public.topic_distribution(uuid) to anon, authenticated;
