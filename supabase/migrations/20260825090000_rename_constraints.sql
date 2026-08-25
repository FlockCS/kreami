-- Renaming a table does not rename its constraints, so the schema still carried
-- names like topics_merged_into_topic_id_fkey. These surface in two places that
-- matter: the generated TypeScript types, and the error message a user sees
-- when a constraint is violated. Finishing the rename here keeps the vocabulary
-- consistent everywhere rather than almost everywhere.

alter table public.experiences rename constraint topics_pkey to experiences_pkey;
alter table public.experiences rename constraint topics_slug_key to experiences_slug_key;
alter table public.experiences
  rename constraint topics_created_by_fkey to experiences_created_by_fkey;
alter table public.experiences
  rename constraint topics_merged_into_topic_id_fkey
  to experiences_merged_into_experience_id_fkey;

alter table public.experience_aliases
  rename constraint topic_aliases_pkey to experience_aliases_pkey;
alter table public.experience_aliases
  rename constraint topic_aliases_topic_id_fkey to experience_aliases_experience_id_fkey;

alter table public.experience_resolution_log
  rename constraint topic_resolution_log_pkey to experience_resolution_log_pkey;
alter table public.experience_resolution_log
  rename constraint topic_resolution_log_matched_topic_id_fkey
  to experience_resolution_log_matched_experience_id_fkey;
alter table public.experience_resolution_log
  rename constraint topic_resolution_log_user_id_fkey
  to experience_resolution_log_user_id_fkey;

alter table public.kreamis
  rename constraint kreamis_topic_id_fkey to kreamis_experience_id_fkey;
