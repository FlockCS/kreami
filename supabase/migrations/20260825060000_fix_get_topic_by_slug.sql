-- get_topic_by_slug returned `public.topics` (a composite), so a slug that
-- matches nothing came back as an object with every field null rather than as
-- no result. Clients would have had to test `data.id === null`, which reads
-- like a corrupt row rather than a miss — and is easy to get wrong.
--
-- It also relied on `coalesce(w.*, t.*)` across two row values. Returning
-- `setof` lets the redirect be written as an explicit self-join instead: join
-- each topic to its merge target, or to itself when it has none.
--
-- The return type changes, so the function must be dropped rather than replaced.

drop function if exists public.get_topic_by_slug(text);

create function public.get_topic_by_slug(s text)
returns setof public.topics
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.*
    from public.topics t
    join public.topics w on w.id = coalesce(t.merged_into_topic_id, t.id)
   where t.slug = s
     and w.is_hidden = false;
$$;

revoke execute on function public.get_topic_by_slug(text) from public;
grant execute on function public.get_topic_by_slug(text) to anon, authenticated;
