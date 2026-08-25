-- Replies are cut from v1.
--
-- The schema, the trigger and post_reply() all stay: they work, they are
-- verified, and reinstating them is one grant. What changes is that no client
-- can write one.
--
-- Why revoke rather than just hide the UI: a write path with no read path is
-- the worst of both. Anyone could post replies through the API and nobody
-- would ever see them, so the rows would accumulate, need moderating, and
-- serve nobody. Closed until there is a surface to read them on.
--
-- The reason for cutting them is in docs/11 (D18): a rating is aimed at an
-- experience, a reply is aimed at a person, and Kreami has no block feature
-- (Q1). Replies are what would make blocks urgent rather than theoretical.
--
-- To restore, when blocks exist:
--   grant execute on function public.post_reply(uuid, text) to authenticated;

revoke execute on function public.post_reply(uuid, text) from authenticated;

comment on function public.post_reply(uuid, text) is
  'Deferred from v1 — granted to nobody. See docs/11 D18. Restore with a grant to authenticated once user blocks exist.';

comment on table public.replies is
  'Deferred from v1. Kept because it works and reinstating is one grant; see docs/11 D18.';
