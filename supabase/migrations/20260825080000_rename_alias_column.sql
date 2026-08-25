-- The previous migration renamed topic_aliases to experience_aliases but left
-- its foreign key column named topic_id, while the functions recreated in the
-- same migration already referenced experience_id.
--
-- plpgsql resolves column names at runtime, not at CREATE FUNCTION time, so
-- resolve_experience() and merge_experiences() were created without complaint
-- and would have failed on their first alias lookup — which only happens after
-- a merge, so it could have sat unnoticed for a long time.

alter table public.experience_aliases rename column topic_id to experience_id;
