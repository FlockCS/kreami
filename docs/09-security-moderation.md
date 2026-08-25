# 09 — Security & Moderation

> With no backend server, **RLS is the only thing between a user and everyone's data.**
> A missing policy isn't a bug that throws an error — it's a silent, total data exposure.
> This document is mandatory, not an appendix.

## The rule

**Every table has RLS enabled. No exceptions, ever.** A new table without RLS is readable
and writable by anyone holding the anon key — which is compiled into the app and trivially
extractable. Add this to CI so it can't be forgotten:

```sql
-- Fails the build if any public table lacks RLS.
select tablename from pg_tables
 where schemaname = 'public'
   and tablename not in (
     select c.relname from pg_class c
      where c.relrowsecurity = true
   );
```

## Policy set

### profiles
```sql
alter table profiles enable row level security;

create policy profiles_public_read on profiles
  for select using (true);

create policy profiles_own_update on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

Insert happens through a trigger on `auth.users`, not from the client — a user should not
be able to create a profile row for an arbitrary id.

**Handles are not editable from the client.** Allowing free handle changes enables
impersonation: build a following as `@kreami_official`, hand the handle off, take a new one.
Gate changes behind an RPC that enforces a cooldown (one change per 30 days) and reserves
the old handle for 90 days.

### topics
```sql
alter table topics enable row level security;

create policy topics_public_read on topics
  for select using (is_hidden = false);

-- Creation only through the RPC, never a raw insert.
create policy topics_no_direct_insert on topics
  for insert with check (false);
```

Direct inserts are blocked entirely. If the client could insert Topics, it would bypass
normalization, slug generation, and dedupe — and the whole matching pipeline in
[05](05-topic-matching.md) becomes optional. `create_topic()` is `security definer` and is
the only path in.

**Nobody can edit a Topic title.** A Topic with 200 Kreamis attached is a shared object;
letting anyone rename it retroactively changes what 200 people rated. Renames are admin-only,
and only for typo fixes.

### kreamis, likes, replies, follows
The standard shape — public read of non-hidden rows, write only your own:

```sql
alter table kreamis enable row level security;

create policy kreamis_public_read on kreamis for select
  using (is_hidden = false
         and exists (select 1 from profiles p
                     where p.id = kreamis.user_id and p.is_suspended = false));

create policy kreamis_own_write on kreamis for insert
  with check (auth.uid() = user_id);
create policy kreamis_own_update on kreamis for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kreamis_own_delete on kreamis for delete
  using (auth.uid() = user_id);
```

### notifications
```sql
create policy notifications_own_read on notifications
  for select using (auth.uid() = user_id);
create policy notifications_own_update on notifications
  for update using (auth.uid() = user_id);
```

No insert policy at all — only the `security definer` triggers write here. Otherwise a user
could fabricate notifications in someone else's activity tab.

### reports
```sql
create policy reports_own_insert on reports
  for insert with check (auth.uid() = reporter_id);
-- No select policy: reporters cannot read reports, not even their own.
```

Reports are **write-only from the client**. If a reporter could read the queue, they could
see who else reported what — a harassment vector.

## `security definer` discipline

Every `security definer` function bypasses RLS. Each one is a potential privilege escalation
and deserves review:

1. **Always `set search_path = public, pg_temp`** on the function. Without it, a user-created
   schema earlier in the search path can shadow a table name and hijack execution.
2. **Always check `auth.uid() is null`** and raise. Never assume a caller is authenticated.
3. **Never accept a `user_id` parameter.** Take the actor from `auth.uid()`. A function with
   `post_kreami(user_id uuid, ...)` lets anyone post as anyone.
4. **Revoke from `anon` BY NAME.** ⚠️ `revoke execute ... from public` is *not* enough on
   Supabase, and this bit us for real in Phase 1. Supabase ships default privileges that
   grant EXECUTE on new functions in `public` to `anon` and `authenticated` **directly**;
   revoking from `PUBLIC` removes only the implicit grant and leaves the direct one intact.
   The function stays callable without a session.

```sql
alter function post_kreami set search_path = public, pg_temp;
revoke execute on function post_kreami from public, anon;
grant execute on function post_kreami to authenticated;
```

**Verify it, don't assume it.** Call every new function with nothing but the anon key and
confirm you get `42501 permission denied` — not your own "Not authenticated" error, which
means the function ran and merely declined. Those two look identical from the client and
mean very different things:

```bash
curl -sS -X POST "$URL/rest/v1/rpc/your_function" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d '{}'
```

## Rate limiting

There's no API gateway, so limits live in Postgres.

```sql
create table rate_limit_events (
  user_id uuid not null references profiles(id) on delete cascade,
  action  text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_idx on rate_limit_events (user_id, action, created_at desc);

create or replace function assert_rate_limit(
  action text, max_count int, window_size interval
) returns void language plpgsql security definer as $$
declare n int;
begin
  select count(*) into n from rate_limit_events e
   where e.user_id = auth.uid() and e.action = assert_rate_limit.action
     and e.created_at > now() - window_size;
  if n >= max_count then
    raise exception 'Rate limit exceeded: %', action using errcode = 'P0001';
  end if;
  insert into rate_limit_events (user_id, action) values (auth.uid(), action);
end $$;
```

| Action | Limit | Why |
|--------|-------|-----|
| `post_kreami` | 30 / hour | Generous for humans, ruinous for a script |
| `create_topic` | 10 / hour | Topic spam pollutes search for everyone — the tightest limit |
| `follow` | 100 / hour | Mass-follow is the #1 growth-spam pattern |
| `reply` | 60 / hour | |
| `submit_report` | 10 / hour | Report-flooding is itself a harassment tool |
| `like` | 300 / hour | Cheap action, loose limit |

Prune `rate_limit_events` nightly (`delete where created_at < now() - interval '2 days'`) or
it becomes the biggest table in the database.

## Content moderation

### At creation
A lightweight blocklist check on Topic titles inside `create_topic()` — slurs and obvious
spam patterns. **Deliberately minimal.** An aggressive filter on an app whose premise is
"rate anything" will reject legitimate experiences constantly, and each false positive is a
user who stops posting. Titles are public and permanent, which is the only reason to filter
at all; notes and replies get no creation-time filter.

### After the fact
The report queue is the real system. Reports land in `reports`; you review them in a
Supabase dashboard SQL view. At v1 volume this is **a few minutes a week**, and building an
admin UI before you have reports is premature. Build it when the queue takes longer to read
than to build.

Actions available: hide a Kreami/Reply (`is_hidden = true`, reversible), hide a Topic,
suspend a user (`is_suspended = true`, hides all their content via the read policies).

**Everything is a soft hide.** Never hard-delete user content in response to a report —
you'll want to reverse it, and you'll want the record.

### Blocks
Not in v1, and that's a real gap worth naming: on a public social app with replies, a user
being followed and replied to by someone they want nothing to do with has **no recourse but
to report or leave**. If any harassment appears, a user-level block (mutual invisibility)
becomes the top priority — ahead of any feature on the roadmap.

## Auth specifics

- **Magic links via Resend.** Supabase's built-in SMTP allows only a couple of emails per
  hour — it will silently fail for real users. Configure custom SMTP before launch, not after
  the first person can't sign in.
- **Deep links.** Magic links must open the app on mobile and the site on web. Configure the
  Expo scheme and universal links, and test on a real device — this is the most common
  broken-in-production auth issue in Expo apps.
- **Session storage:** `expo-secure-store` on native, `localStorage` on web. The Supabase
  client handles refresh; don't hand-roll it.
- **The anon key is public.** It's in the app bundle. That's expected and safe *only*
  because RLS is correct. The **service role key must never appear in the client** — it
  bypasses RLS entirely. It belongs in GitHub Actions secrets and nowhere else.

## Privacy

- Only email addresses are collected, and only by Supabase Auth. The app never displays or
  queries them.
- **Ratings are permanent and public**, including edits. Say so plainly in the sign-up copy.
- **Account deletion must actually work.** `delete from auth.users` cascades to profiles,
  Kreamis, follows, and likes. Offer it in settings from v1 — it's a GDPR/CCPA requirement
  and it's a five-line RPC.
- Topic *aggregates* survive a user deletion (the rating_sum is recomputed), which is correct
  — but confirm that no deleted user's handle survives anywhere, including in old
  notification rows.

## Pre-launch checklist

- [ ] RLS enabled on every table; the CI check above passes
- [ ] Every `security definer` function has `search_path` set and `execute` revoked from public
- [ ] Service role key exists only in GitHub Actions secrets
- [ ] Rate limits active on all six actions
- [ ] Custom SMTP configured and a magic link tested end-to-end on a real phone
- [ ] Account deletion tested end-to-end
- [ ] Anonymous read verified working on `/t/:slug` in a logged-out browser
- [ ] Anonymous *write* verified **blocked** on every table
- [ ] Nightly counter reconciliation job running
- [ ] Supabase keepalive cron running
