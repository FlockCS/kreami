# 07 — API Surface

There is no REST API to design. The client uses two mechanisms:

1. **PostgREST table reads** through the Supabase JS client, governed by RLS.
2. **RPC calls** to Postgres functions, for anything with logic.

The rule: **reads that are a plain filtered select go through PostgREST; everything else is
an RPC.** If a client ever needs to make two calls in sequence to keep data consistent, that
should have been one RPC.

## RPC catalog

### `resolve_topic(raw_title text)`
Resolves free-form text to a Topic. The heart of the compose flow — see
[05 — Topic Matching](05-topic-matching.md).

```ts
{ topic_id: string, matched_title: string, is_new: boolean }
```

Exact normalized match on a live Topic or a known alias → join it. Otherwise a Topic is
created and `is_new` is `true`. Either way the client proceeds straight to the rating step:
there is no confirmation branch to handle.

### `search_topics(q text, lim int)`
Autocomplete. Called on every keystroke (debounced 250 ms). Must stay under ~50 ms.

```ts
Array<{ id, title, slug, kreami_count, avg_kreams: number | null, score: number }>
```

### `post_kreami(raw_title text, rating smallint, note text)`
The single write that matters. Resolves the Topic, upserts the Kreami, fires all triggers —
**atomically**. The client never resolves and then posts as two calls; a failure between them
would create an orphan Topic.

```sql
create or replace function post_kreami(
  raw_title text, rating smallint, note text default null
) returns table (kreami_id uuid, topic_id uuid, topic_slug text, was_edit boolean)
language plpgsql security definer as $$
declare tid uuid; existing uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if rating < 0 or rating > 5 then raise exception 'Rating must be 0-5'; end if;
  perform assert_rate_limit('post_kreami', 30, interval '1 hour');

  select r.topic_id into tid from resolve_topic(raw_title) r;

  select id into existing from kreamis
   where user_id = auth.uid() and topic_id = tid;

  if existing is not null then
    update kreamis set rating = post_kreami.rating,
                       note = post_kreami.note,
                       updated_at = now()
     where id = existing;
    return query select existing, tid, (select slug from topics where id = tid), true;
  else
    insert into kreamis (user_id, topic_id, rating, note)
    values (auth.uid(), tid, post_kreami.rating, post_kreami.note)
    returning id into existing;
    return query select existing, tid, (select slug from topics where id = tid), false;
  end if;
end $$;
```

`was_edit` lets the client say *"Updated your Kreami"* instead of *"Posted"* — a small
honesty that prevents users thinking they double-posted.

If the fuzzy confirmation step is ever reinstated
([05 — Topic Matching](05-topic-matching.md), *Deferred*), it comes back as a `force_new
boolean default false` parameter here, set by the escape hatch. Nothing else changes.

### `home_feed(before timestamptz, lim int)`
Keyset-paginated following feed. See [06](06-feeds-and-social.md).

### `global_feed(before timestamptz, lim int)`
Same shape, no follow filter. Same TypeScript type, so the client renders both with one
component.

### `active_topics(lim int)`
Discovery ranking.

### `topic_thread(slug text, sort text, before timestamptz, lim int)`
Kreamis on one Topic. `sort` ∈ `'recent' | 'top' | 'highest' | 'lowest'`.
Transparently follows `merged_into_topic_id`.

### `topic_distribution(topic_id uuid)`
Six rows for the histogram.

```ts
Array<{ rating: 0|1|2|3|4|5, count: number }>
```

### `user_profile(handle text)`
Profile header plus computed stats: Kreami count, followers, following,
average Kream given, and whether the viewer follows them.

**"Average Kream given" is a personality metric** — it tells you at a glance whether someone
is a soft touch or a hater, and it's worth surfacing prominently on the profile.

### `toggle_follow(target uuid)` / `toggle_like(kreami uuid)`
Idempotent toggles returning the new state and count. One call, no read-then-write race.

```ts
{ following: boolean, follower_count: number }
{ liked: boolean, like_count: number }
```

### `mark_notifications_read()`
Sets `read_at = now()` on all unread rows for the caller.

### `submit_report(...)`
Files a report. Rate-limited to 10/hour to prevent report-spam as a harassment vector.

### Admin-only (service role, never callable by `authenticated`)
`merge_topics(loser, winner)` · `hide_kreami(id)` · `suspend_user(id)` ·
`duplicate_candidates(lim)`

## Direct table reads via PostgREST

Fine to do from the client because RLS covers them:

```ts
// A user's Kreamis, paginated
supabase.from('kreamis')
  .select('id, rating, note, created_at, like_count, reply_count, topics(title, slug)')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .lt('created_at', cursor)
  .limit(20)

// Replies on a Kreami
supabase.from('replies')
  .select('id, body, created_at, profiles(handle, display_name, avatar_url)')
  .eq('kreami_id', kreamiId)
  .order('created_at')
```

**Always name your columns.** `select('*')` on a feed is the single easiest way to blow
through the 5 GB egress ceiling.

## Client conventions

**Every RPC gets a typed TanStack Query hook** in `lib/queries/`. Components never call
`supabase.rpc` directly — that keeps cache keys consistent and makes the fan-out-on-write
migration in [06](06-feeds-and-social.md) a one-file change.

```ts
export function usePostKreami() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PostKreamiInput) => {
      const { data, error } = await supabase.rpc('post_kreami', input);
      if (error) throw error;
      return data[0];
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['home_feed'] });
      qc.invalidateQueries({ queryKey: ['topic', res.topic_slug] });
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
    },
  });
}
```

**Optimistic updates for likes and follows only.** They're trivially reversible and the
latency is the whole UX. Do *not* optimistically render a posted Kreami — the server decides
which Topic it lands on, and guessing wrong means showing the user the wrong thread.

## Errors

Postgres exceptions arrive as `{ message, code }`. Map them to human copy in one place:

| Raised | Shown |
|--------|-------|
| `Rating must be 0-5` | "Pick a rating from 0 to 5 Kreams." |
| `Topic title too short` | "Say a little more about the experience." |
| `Rate limit exceeded: post_kreami` | "Slow down — you've posted a lot in the last hour." |
| `Not authenticated` | Redirect to sign-in, preserving the draft. |

**Preserving the draft on an auth bounce matters.** A user who types an experience, gets
kicked to sign-in, and loses their text does not come back and retype it.

## Realtime

Supabase Realtime is available and free up to 200 concurrent connections. **Don't use it in
v1.** Live-updating feeds are a novelty here, the connection budget is small, and a
pull-to-refresh is understood by everyone.

The one place worth it later: **live updates on an open Topic thread**, so a busy thread
visibly moves while you're reading it. That's a nice moment. It's Phase 5+.
