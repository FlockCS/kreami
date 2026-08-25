# 10 — Roadmap

Sized for **one person, evenings and weekends, with Claude Code**. Sessions are ~2–4 hours.
Estimates assume AI-assisted implementation and are deliberately conservative on the parts
that are actually hard (matching, RLS, auth deep links) and aggressive on the parts that are
CRUD.

Phases ship in order. **Each phase ends with something runnable** — no phase leaves the app
in a broken state.

---

## Phase 0 — Foundation (2–3 sessions) — *scaffold landed 2026-08-25*

Nothing user-visible. Everything downstream depends on it.

**In the repo:**

- [x] Git repo, TypeScript strict, ESLint (flat config) + Prettier
- [x] Expo SDK 57 / RN 0.86 app with Expo Router, NativeWind 4, TanStack Query 5
- [x] Editorial design tokens wired into `tailwind.config.js` and `src/theme/tokens.ts`
- [x] Supabase client with a chunked SecureStore session adapter (SecureStore caps values
      at 2 KB; a session JWT exceeds it)
- [x] Supabase CLI as a devDependency; `supabase/config.toml`; first migration written
- [x] `db:types` / `db:types:local` scripts; `database.types.ts` placeholder in place
- [x] GitHub Actions: `ci`, `migrate`, `deploy-web`, `keepalive`
- [x] Verified: `typecheck`, `lint`, `format:check`, and `expo export --platform web` all
      pass, and the export renders correctly in a browser

**Needs an account, so it needs you** — full instructions in
[12 — Environment Setup](12-environment-setup.md):

- [x] Create `kreami-dev`; fill `.env.local` *(done 2026-08-25)*
- [x] `supabase db push` migrations; regenerate types *(done — the foundation screen now
      completes a real round trip to Postgres)*
- [ ] Create `kreami-prod` (not needed until deploy)
- [ ] Create the Cloudflare Pages project `kreami`
- [ ] Add the nine GitHub secrets and the `production` environment
- [ ] Watch all four workflows go green once

**Done when:** a schema change on your laptop reaches prod through CI, and the web build
deploys automatically.

> Do the keepalive cron in Phase 0. If you skip it, the dev project pauses during a two-week
> gap between sessions and you lose an evening confused about why nothing works.

---

## Phase 1 — Auth and identity (2–3 sessions)

- [x] `profiles` table, `reserved_handles` (with expiry), RLS policies, column grants
- [x] Trigger creating a profile row on `auth.users` insert
- [x] `handle_available()`, `claim_handle()` (30-day cooldown, 90-day reservation),
      `delete_account()` — all verified unreachable without a session
- [x] Session provider with restore-before-route, and the redirect guard
- [x] Sign-in screen, handle picker with live availability, sign out, delete account
- [ ] Google OAuth on web and native
- [ ] Magic link with **Resend SMTP configured** — not the built-in sender
- [ ] Deep link handling; **tested on a physical phone**
- [ ] Handle picker with live availability check
- [ ] Session persistence: secure-store native, localStorage web
- [ ] Sign out, and account deletion

**Done when:** you can sign in with Google on iOS, Android, and web with the same account,
close the app, reopen it, and still be signed in.

> Auth deep links are the most common place Expo projects lose a weekend. Budget for it and
> test on hardware, not just the simulator.

---

## Phase 2 — The core loop (4–6 sessions)

The heart of the product. If you build only this, you have something worth showing.

- [x] `experiences`, `experience_aliases`, `kreamis` tables with indexes and RLS
- [x] `normalize_experience_title()`, `slugify()`, `create_experience()`, `resolve_experience()` (internal)
- [x] `search_experiences()` with the trigram index, `get_experience_by_slug()`, `experience_distribution()`
- [x] `post_kreami()` with rate limiting, and `merge_experiences()`
- [x] Counter triggers + `recompute_experience_aggregates()`
- [x] **`experience_resolution_log` writing from day one** — it is the evidence that decides
      whether the exact-match rule survives the beta
- [x] Web layout constrained to a centred column
- [ ] `KreamRating` component: display and input, with 0 visually distinct from unrated
- [ ] Compose flow: text → live search → resolve → rate → post (two steps, no confirmation)
- [ ] Experience thread screen with histogram and sort tabs
- [ ] Your own profile listing your Kreamis

**Done when:** you can post a Kreami, have a friend post on the same experience by typing
something slightly different, and land in the same thread.

> This is the phase to slow down on. The matching pipeline in
> [05](05-experience-matching.md) is the product. Everything after this is a list view.

---

## Phase 3 — Social (3–4 sessions)

- [x] `follows`, `likes`, `replies` with triggers and RLS
- [x] `home_feed()` and `global_feed()` with keyset pagination, plus
      `active_experiences()`, `toggle_follow()`, `toggle_like()`, `post_reply()`
- [x] Feed card component, shared between both feeds
- [x] Infinite scroll (keyset), pull to refresh
- [x] Follow/unfollow, and likes with optimistic updates
- [x] Other users' profiles, with `public_profile()` and `profile_kreamis()`
- [x] **Empty-feed backfill** — the global feed inline when the following feed is thin
- [x] Tab shell: Home, Discover, compose, You
- [x] ~~Replies~~ — cut from v1 (D18). Schema and `post_reply()` kept, grant withdrawn.
- [x] Follower / following lists, both tabs on one screen, with the row-level follow toggle

**Done when:** two accounts can follow each other and see each other's Kreamis in Home.

---

## Phase 4 — Discovery and activity (2–3 sessions)

- [ ] Discover screen: search + `active_experiences()`
- [ ] User search by handle and display name
- [ ] `notifications` table + triggers, with the **24h `experience_activity` cap**
- [ ] Activity tab, unread badge, mark-all-read
- [ ] `suggested_profiles` table and the onboarding follow step

**Done when:** a brand-new account can find people and experiences without knowing anyone.

---

## Phase 5 — Launch readiness (3–4 sessions)

- [ ] Onboarding: 4 screens, ending in "leave your first Kreami"
- [ ] Report flow + `reports` table
- [ ] Admin SQL views: report queue, duplicate candidates, resolution-log stats
- [ ] `merge_experiences()` + nightly duplicate-candidate report
- [ ] Nightly counter reconciliation
- [ ] **OpenGraph Worker** for `/e/:slug` and `/u/:handle` — link previews
- [ ] Sentry
- [ ] Full [security checklist](09-security-moderation.md#pre-launch-checklist)
- [ ] Seed 50–100 Experiences yourself so the app isn't empty on day one

**Done when:** the checklist passes and a shared link renders a real preview card.

> **Seeding is not optional.** An empty rating app is unusable — the first ten users need
> threads to join, or they'll each create a lonely Experience and leave. Write 50–100 Kreamis on
> obviously universal experiences before anyone else sees it.

---

## Phase 6 — Private beta (ongoing)

Not a build phase. 20–50 people you know.

**Watch these three numbers.** They're the ones the design is betting on:

1. **Median Kreamis per Experience** (experiences older than 7 days). If it stays at 1.0, the
   exact-match rule is fragmenting the corpus and search-as-you-type isn't catching enough
   people before they type a duplicate. **This is the most important number in the app**, and
   under the exact-match rule it is also the number most at risk.
2. **Share of posts resolving to `new`** in the resolution log — and, by eye, how many of
   those are near-misses of a Experience that already existed. That ratio is the direct measure of
   what the exact-match rule is costing.
3. **Second-post rate within 48 hours.** The retention signal that matters.

If (1) sits near 1.0 and (2) is full of near-misses, the remedies are ready and ordered in
[05 — Experience Matching](05-experience-matching.md): strip punctuation in normalization first, then
reinstate the fuzzy confirmation step if that isn't enough.

---

## After beta, in rough priority order

| Item | Trigger |
|------|---------|
| **User blocks** | Immediately, if any harassment appears. Jumps the queue. |
| Push notifications | Retention is the problem and in-app isn't enough |
| Photos | Users repeatedly ask; accept the storage and moderation cost |
| Native app store release | Web has traction. Costs $99/yr + $25 |
| `feed_entries` fan-out | Home feed exceeds ~500 ms |
| Materialized `active_experiences` | Discover exceeds ~200 ms |
| Embedding-based dedupe | Duplicate report fills with semantic pairs ([05](05-experience-matching.md)) |
| Pairwise comparison ranking | Users want personal ranked lists |
| Private accounts | Repeatedly requested — and re-read [11](11-decisions-and-open-questions.md) first |

---

## Rough total

**16–23 sessions to a private beta.** At two sessions a week, roughly **two to three months**.

The estimate is honest about where it will slip: **Phase 2 will take longer than written**,
because experience matching is a real problem with a real feedback loop, not a CRUD screen. If a
phase is going to overrun, let it be that one — it's the only one where extra care compounds.
