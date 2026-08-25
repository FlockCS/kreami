-- Phase 0: prove the migration pipeline end to end.
--
-- Deliberately minimal — this migration exists so that a schema change made on
-- a laptop reaches production through CI rather than through the dashboard.
-- Tables arrive in Phase 1 (profiles) and Phase 2 (topics, kreamis).
--
-- See docs/04-data-model.md for the full schema this builds towards.

-- uuid_generate_v4() for primary keys.
create extension if not exists "uuid-ossp" with schema extensions;

-- Trigram similarity. Powers search-as-you-type and the nightly duplicate
-- candidate report. NOT used for topic resolution, which is exact-match only.
-- See docs/05-topic-matching.md.
create extension if not exists pg_trgm with schema extensions;

-- Installed but not used by normalize_topic_title(): the matching rule is
-- "same text ignoring case", and unaccenting would overrule what a user typed.
-- Kept available because search ranking may want it later.
create extension if not exists unaccent with schema extensions;
