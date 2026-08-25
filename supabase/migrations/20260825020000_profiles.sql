-- Phase 1: identity.
--
-- See docs/04-data-model.md for the intended shape and docs/09-security-moderation.md
-- for the rules this enforces.
--
-- Deviation from doc 04, deliberate: `handle` is NULLABLE here. The trigger below
-- creates a profile the moment an auth user exists (doc 04's portability rule: the
-- app must never read auth.users directly), but the person has not picked a handle
-- yet at that point. A null handle is the clean signal for "signed up, not yet
-- onboarded". The alternative — generating `user_a3f9` style placeholders — pollutes
-- the namespace and turns the first claim into a "change" subject to the cooldown.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Null until claimed via claim_handle(). The check enforces lowercase, so a plain
  -- unique constraint is already case-insensitive; no lower() index is needed.
  handle text unique check (handle ~ '^[a-z0-9_]{3,20}$'),

  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text check (char_length(bio) <= 160),
  avatar_url text,

  kreami_count integer not null default 0 check (kreami_count >= 0),
  follower_count integer not null default 0 check (follower_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),

  is_suspended boolean not null default false,

  -- Null until the handle is changed for the first time. The initial claim is free;
  -- only subsequent changes are rate-limited.
  handle_changed_at timestamptz,

  created_at timestamptz not null default now()
);

comment on column public.profiles.handle is
  'Null until claimed. Only settable through claim_handle().';

-- Handles that cannot be claimed. `reserved_until` null means permanent (route
-- names and impersonation risks); a timestamp means a handle released by a user,
-- held so it cannot immediately be taken over. See docs/09.
create table public.reserved_handles (
  handle text primary key,
  reserved_until timestamptz,
  reason text not null default 'system',
  created_at timestamptz not null default now()
);

insert into public.reserved_handles (handle) values
  ('admin'), ('administrator'), ('kreami'), ('kream'), ('kreams'), ('official'),
  ('staff'), ('mod'), ('moderator'), ('support'), ('help'), ('about'), ('legal'),
  ('terms'), ('privacy'), ('settings'), ('api'), ('search'), ('feed'), ('discover'),
  ('activity'), ('login'), ('logout'), ('signup'), ('signin'), ('register'),
  ('new'), ('edit'), ('me'), ('you'), ('root'), ('null'), ('undefined'),
  ('static'), ('assets'), ('public'), ('blog'), ('status'), ('dev'),
  ('t'), ('u'), ('k');

-- A profile exists as soon as an auth user does, so nothing downstream has to
-- handle "authenticated but no profile row".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raw jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  name text;
begin
  name := nullif(btrim(coalesce(raw ->> 'full_name', raw ->> 'name', '')), '');
  if name is null then
    name := split_part(coalesce(new.email, 'there'), '@', 1);
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, left(name, 40), nullif(raw ->> 'avatar_url', ''))
  on conflict (id) do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.reserved_handles enable row level security;

-- Anyone, signed in or not, reads onboarded and unsuspended profiles. Anonymous
-- read is deliberate: a shared link must work without an account (docs/04).
create policy profiles_public_read on public.profiles
  for select using (handle is not null and is_suspended = false);

-- You can always read yourself, including before you have picked a handle.
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);

create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No insert policy: rows come only from the trigger above.
-- No delete policy: deletion cascades from auth.users via delete_account().

-- reserved_handles has RLS on and no policies at all, so it is unreachable from
-- the client. The security definer functions below bypass RLS to consult it.

-- ---------------------------------------------------------------------------
-- Column privileges
--
-- RLS decides which ROWS you may touch; it cannot stop you writing a column you
-- should not. Handles and denormalised counters must never be settable by a
-- direct client update, so they are withheld at the grant level.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_url) on public.profiles to authenticated;

revoke all on public.reserved_handles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create or replace function public.handle_available(candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  h text := lower(btrim(candidate));
begin
  if h !~ '^[a-z0-9_]{3,20}$' then
    return false;
  end if;

  if exists (
    select 1 from public.reserved_handles r
     where r.handle = h
       and (r.reserved_until is null or r.reserved_until > now())
  ) then
    return false;
  end if;

  return not exists (select 1 from public.profiles p where p.handle = h);
end $$;

comment on function public.handle_available(text) is
  'True when a handle is well-formed, unreserved and unclaimed.';

create or replace function public.claim_handle(new_handle text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  h text := lower(btrim(new_handle));
  me public.profiles;
  cooldown constant interval := interval '30 days';
  reservation constant interval := interval '90 days';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'No profile for this account';
  end if;

  if h !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Handles are 3 to 20 characters, using a-z, 0-9 and underscore';
  end if;

  -- Re-claiming your own handle is a no-op, not an error.
  if me.handle is not null and me.handle = h then
    return h;
  end if;

  -- The cooldown applies to changes only. The first claim is always free.
  if me.handle is not null
     and me.handle_changed_at is not null
     and me.handle_changed_at > now() - cooldown then
    raise exception 'You can change your handle again after %',
      to_char(me.handle_changed_at + cooldown, 'Mon DD, YYYY');
  end if;

  if not public.handle_available(h) then
    raise exception 'That handle is not available';
  end if;

  if me.handle is not null then
    -- Hold the vacated handle so it cannot immediately be used to inherit an
    -- audience built under it. See docs/09.
    insert into public.reserved_handles (handle, reserved_until, reason)
    values (me.handle, now() + reservation, 'released')
    on conflict (handle) do update
      set reserved_until = excluded.reserved_until, reason = 'released';

    update public.profiles
       set handle = h, handle_changed_at = now()
     where id = auth.uid();
  else
    update public.profiles set handle = h where id = auth.uid();
  end if;

  return h;

exception
  -- handle_available() and the unique index race; the index is the arbiter.
  when unique_violation then
    raise exception 'That handle is not available';
end $$;

comment on function public.claim_handle(text) is
  'Claims or changes the caller''s handle, enforcing the 30-day change cooldown.';

-- Account deletion has to actually work from day one (docs/09, and GDPR/CCPA).
-- Deleting the auth user cascades to the profile and, later, to Kreamis and edges.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

comment on function public.delete_account() is
  'Permanently deletes the calling user. Cascades to all owned rows.';

revoke execute on function public.handle_available(text) from public;
revoke execute on function public.claim_handle(text) from public;
revoke execute on function public.delete_account() from public;

-- Availability is checked during onboarding, before a handle exists, but the
-- caller is already signed in by then; anon does not need it.
grant execute on function public.handle_available(text) to authenticated;
grant execute on function public.claim_handle(text) to authenticated;
grant execute on function public.delete_account() to authenticated;
