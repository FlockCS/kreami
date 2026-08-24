# 06 — Feeds & Social Graph

## The three feeds

| Feed | Contents | Who it's for |
|------|----------|--------------|
| **Home** | Kreamis from people you follow, newest first | Returning users with a graph |
| **Discover** | Global recent + active topics | New users, and the answer to cold start |
| **Topic thread** | All Kreamis on one Topic | Anyone arriving from a link or search |

## Home feed

**Fan-out-on-read.** One query, joined against the follow graph. No precomputation, no
materialized table, no background jobs.

```sql
create or replace function home_feed(before timestamptz default null, lim int default 20)
returns table (
  kreami_id uuid, rating smallint, note text, created_at timestamptz,
  like_count int, reply_count int, liked_by_me boolean,
  user_id uuid, handle text, display_name text, avatar_url text,
  topic_id uuid, topic_title text, topic_slug text,
  topic_avg numeric, topic_kreami_count int
)
language sql stable security definer as $$
  select k.id, k.rating, k.note, k.created_at,
         k.like_count, k.reply_count,
         exists (select 1 from likes l
                 where l.kreami_id = k.id and l.user_id = auth.uid()),
         p.id, p.handle, p.display_name, p.avatar_url,
         t.id, t.title, t.slug,
         case when t.kreami_count >= 3
              then round(t.rating_sum::numeric / t.kreami_count, 1) end,
         t.kreami_count
    from kreamis k
    join profiles p on p.id = k.user_id
    join topics   t on t.id = k.topic_id
   where k.is_hidden = false
     and p.is_suspended = false
     and (k.user_id = auth.uid()                          -- your own posts
          or k.user_id in (select followee_id from follows
                           where follower_id = auth.uid()))
     and (before is null or k.created_at < before)
   order by k.created_at desc
   limit least(lim, 50);
$$;
```

Three things to notice:

1. **Keyset pagination, not `OFFSET`.** The client passes the `created_at` of the last row
   it has. `OFFSET` degrades linearly and duplicates rows when new posts arrive mid-scroll.
2. **The column list is explicit and narrow.** Never `select *` in a feed —
   Supabase egress is the first free-tier limit you'll hit, and it's paid per byte of every
   feed page every user scrolls.
3. **Your own Kreamis are included.** A brand-new user who follows nobody still sees their
   own post land, which makes the app feel alive from post one. Small detail, real effect.

### The empty-feed problem

A new user follows nobody and sees nothing. That's the moment most social apps lose people.
The home feed must never render blank:

- **Zero follows:** don't show an empty state — show the Discover feed inline with a header
  like *"Follow some people to build your feed. Here's what everyone's rating:"*
- **Fewer than 5 follows:** backfill with global Kreamis, visually distinguished, capped at
  half the page.
- **At onboarding:** suggest 5–10 accounts to follow (in v1, a hand-curated list including
  your own seed accounts — an admin-editable `suggested_profiles` table). Do not build
  recommendation logic for this.

## Discover feed

Two tabs, both cheap:

**Recent** — global chronological, same query minus the follow filter.

**Active topics** — the ranked list that fights cold start:

```sql
create or replace function active_topics(lim int default 20)
returns table (id uuid, title text, slug text, kreami_count int,
               avg_kreams numeric, recent_count int)
language sql stable as $$
  select t.id, t.title, t.slug, t.kreami_count,
         case when t.kreami_count >= 3
              then round(t.rating_sum::numeric / t.kreami_count, 1) end,
         count(k.id) filter (where k.created_at > now() - interval '7 days')::int
    from topics t
    left join kreamis k on k.topic_id = t.id and k.is_hidden = false
   where t.merged_into_topic_id is null and t.is_hidden = false
   group by t.id
  having count(k.id) > 0
   order by count(k.id) filter (where k.created_at > now() - interval '7 days') desc,
            t.kreami_count desc
   limit lim;
$$;
```

This aggregate scans; it's fine at small scale and should be a **materialized view refreshed
hourly** the moment it isn't. That's a `create materialized view` plus a cron — do it when the
query exceeds ~200 ms, not before.

**Why "active topics" matters more than it looks:** it's the surface that teaches new users
what a Topic is and gives them something to join. A user whose first action is *adding* a
Kreami to a thread with 30 others has understood the product. A user whose first action is
creating a lonely new Topic hasn't.

## Topic thread

Default sort is **newest first**. Two alternates worth offering:

- **Top** — by `like_count desc`. Surfaces the funny ones, which is most of the value.
- **Highest / Lowest** — by rating. Lets you jump straight to the 0/5s, which is the single
  most entertaining thing in the app and should be easy to reach.

Above the thread sits the Topic header: title, average Kreams, count, and a
**rating distribution histogram** — six bars, 0 through 5. It's cheap
(`select rating, count(*) ... group by rating`), it's genuinely informative, and it's the
thing people screenshot. A topic that's bimodal — lots of 0s *and* lots of 5s — is a
better story than one that averages 2.5, and only the histogram shows that.

## Notifications

Trigger-generated, in-app only.

```sql
create or replace function notify_on_like() returns trigger
language plpgsql security definer as $$
declare owner uuid;
begin
  select user_id into owner from kreamis where id = new.kreami_id;
  if owner is distinct from new.user_id then     -- never notify self-actions
    insert into notifications (user_id, actor_id, kind, kreami_id)
    values (owner, new.user_id, 'kreami_liked', new.kreami_id);
  end if;
  return new;
end $$;
```

The interesting one is **`topic_activity`**: when someone rates a Topic you've already rated,
you get told. This is the retention loop that has nothing to do with the follow graph — it
pulls you back to a thread you cared about even if you follow nobody.

Guard it against noise: **cap it at one notification per topic per user per 24 hours**, or a
popular topic will bury everything else in the activity tab.

```sql
-- inside notify_on_kreami(), before inserting topic_activity rows:
and not exists (
  select 1 from notifications n
   where n.user_id = participant.id
     and n.kind = 'topic_activity'
     and n.topic_id = new.topic_id
     and n.created_at > now() - interval '24 hours'
)
```

Unread count is `select count(*) from notifications where user_id = auth.uid()
and read_at is null`, capped for display at "9+". Mark-all-read on tab open.

## Follows

Instant, no approval, no privacy check — everything is public. A follow is one insert and
two trigger-maintained counters.

**Rate limit follows.** Mass-follow is the cheapest growth-hack abuse there is, and it's the
first thing a spammer does. Cap at ~100/hour per user via a `security definer` function that
checks recent inserts before allowing another. See [09](09-security-moderation.md).

## When fan-out-on-read stops working

It works fine until roughly **10,000 active users** or until someone follows several thousand
accounts. The failure mode is a slow `IN` subquery on a wide follow graph.

The migration, when needed:

```sql
create table feed_entries (
  user_id    uuid not null references profiles(id) on delete cascade,
  kreami_id  uuid not null references kreamis(id) on delete cascade,
  created_at timestamptz not null,
  primary key (user_id, kreami_id)
);
create index feed_entries_idx on feed_entries (user_id, created_at desc);
```

A trigger on `kreamis` inserts one row per follower. `home_feed()` becomes a simple indexed
read of `feed_entries` — **the client code does not change at all**, because the client only
ever calls the function by name. That's the entire reason for putting feeds behind an RPC
instead of building the query in the app.

The known cost of fan-out-on-write is celebrity accounts: a user with 100k followers
generates 100k inserts per post. The standard fix is a hybrid — fan out for normal accounts,
read-time merge for accounts above a follower threshold. Not a v1 concern, and not a v2
concern either.
