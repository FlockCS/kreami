-- Phase 4: notifications.
--
-- Trigger-generated and in-app only — there is no push (BACKLOG), so this
-- table is the entire mechanism by which Kreami ever tells you anything.
--
-- See docs/04 for the shape and docs/06 for the rules.

create type public.notification_kind as enum
  ('new_follower', 'kreami_liked', 'kreami_replied', 'experience_activity');

comment on type public.notification_kind is
  'kreami_replied is carried but never generated: replies are cut from v1 (D18). Kept so restoring them is a grant and a trigger, not a type migration with a table rewrite.';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- Who is being told, and who did the thing. actor_id is nullable because a
  -- notification outlives the person: they delete their account, the row says
  -- "somebody" rather than vanishing out from under a half-read list.
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,

  kind public.notification_kind not null,

  kreami_id uuid references public.kreamis (id) on delete cascade,
  experience_id uuid references public.experiences (id) on delete cascade,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- The unread badge reads this on every app open, so it gets its own partial
-- index rather than scanning a growing history to count a usually-tiny set.
create index notifications_unread_idx on public.notifications (user_id)
  where read_at is null;

-- Supports the 24h experience_activity cap, which is checked once per
-- participant per new Kreami and is the only write-path lookup here.
create index notifications_activity_cap_idx
  on public.notifications (user_id, experience_id, created_at desc)
  where kind = 'experience_activity';

-- ---------------------------------------------------------------------------
-- RLS: your notifications are yours. Nobody else can read them, and nobody
-- can write one at all — every row comes from a trigger below.
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

create policy notifications_own_read on public.notifications
  for select using (auth.uid() = user_id);

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers. Self-actions never notify: being told you liked your own Kreami is
-- the app talking to itself.
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, actor_id, kind)
  values (new.followee_id, new.follower_id, 'new_follower');
  return new;
end $$;

-- No self-check needed: follows_no_self makes it unreachable.
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select k.user_id into owner from public.kreamis k where k.id = new.kreami_id;

  if owner is distinct from new.user_id then
    insert into public.notifications (user_id, actor_id, kind, kreami_id)
    values (owner, new.user_id, 'kreami_liked', new.kreami_id);
  end if;

  return new;
end $$;

create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_on_like();

-- The interesting one.
--
-- When somebody rates an experience you have already rated, you hear about it.
-- This is the retention loop that owes nothing to the follow graph: it pulls
-- you back to a thread you cared about even if you follow nobody, which is
-- exactly the position every new account is in. See docs/06.
--
-- Capped at one per experience per person per 24 hours, because without the
-- cap a single popular experience buries every other kind of notification and
-- the tab becomes noise somebody learns to ignore.
create or replace function public.notify_on_kreami()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, actor_id, kind, kreami_id, experience_id)
  select k.user_id, new.user_id, 'experience_activity', new.id, new.experience_id
    from public.kreamis k
    join public.profiles p on p.id = k.user_id
   where k.experience_id = new.experience_id
     and k.user_id <> new.user_id
     and k.is_hidden = false
     and p.is_suspended = false
     and not exists (
       select 1 from public.notifications n
        where n.user_id = k.user_id
          and n.kind = 'experience_activity'
          and n.experience_id = new.experience_id
          and n.created_at > now() - interval '24 hours'
     );

  return new;
end $$;

-- INSERT only, deliberately. Re-rating an experience updates the existing row
-- (kreamis_one_per_user_experience), and an edit is not news.
create trigger kreamis_notify
  after insert on public.kreamis
  for each row execute function public.notify_on_kreami();

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------

-- One call for the Activity tab: the notification plus everything needed to
-- render a sentence about it. Without the joins the client would fetch actors
-- and experiences one row at a time.
create or replace function public.activity_feed(
  before timestamptz default null,
  lim integer default 30
)
returns table (
  id uuid,
  kind public.notification_kind,
  created_at timestamptz,
  read_at timestamptz,
  actor_id uuid,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text,
  kreami_id uuid,
  kreami_rating smallint,
  kreami_note text,
  experience_id uuid,
  experience_title text,
  experience_slug text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.kind, n.created_at, n.read_at,
         a.id, a.handle, a.display_name, a.avatar_url,
         k.id, k.rating, k.note,
         e.id, e.title, e.slug
    from public.notifications n
    -- Left joins throughout: a deleted actor, a hidden Kreami or a merged
    -- experience must degrade the row, not remove it from your history.
    left join public.profiles a on a.id = n.actor_id and a.is_suspended = false
    left join public.kreamis k on k.id = n.kreami_id and k.is_hidden = false
    left join public.experiences e on e.id = coalesce(n.experience_id, k.experience_id)
   where n.user_id = auth.uid()
     and (before is null or n.created_at < before)
   order by n.created_at desc
   limit least(coalesce(lim, 30), 50);
$$;

-- Called when the tab is opened. Returns how many rows it cleared so the
-- client can settle the badge without a second round trip.
create or replace function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cleared integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;

  get diagnostics cleared = row_count;
  return cleared;
end $$;

revoke execute on function public.activity_feed(timestamptz, integer) from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;

grant execute on function public.activity_feed(timestamptz, integer) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
