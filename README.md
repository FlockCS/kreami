# Kreami

> Rate literally any experience, on one universal scale: **Kreams**.

Kreami is a social rating app for experiences — not restaurants, not films, not products.
Anything. "Eating a candy apple." "Jury duty." "The first cold day of fall."
You write the experience, you give it **0 to 5 Kreams**, and everyone else who has
lived that same experience piles into the same thread with theirs.

A single rating is called **a Kreami**. You *leave a Kreami on* something.

---

## Design docs

Read them in order the first time. After that, jump straight to the one you're drilling into.

| # | Doc | What it answers |
|---|-----|-----------------|
| 01 | [Product Vision](docs/01-product-vision.md) | What Kreami is, who it's for, what it deliberately is not |
| 02 | [Domain Model](docs/02-domain-model.md) | The nouns and verbs — Kreami, Topic, Kream, Follow — and their rules |
| 03 | [Architecture](docs/03-architecture.md) | Stack, hosting, the $0 budget, and the scaling escape hatches |
| 04 | [Data Model](docs/04-data-model.md) | Postgres schema, indexes, triggers, RLS policies |
| 05 | [Topic Matching](docs/05-topic-matching.md) | The hard problem: free-form text → shared threads |
| 06 | [Feeds & Social Graph](docs/06-feeds-and-social.md) | Follows, the home feed, discovery, ranking |
| 07 | [API Surface](docs/07-api-surface.md) | Every call the client makes, and its contract |
| 08 | [UX Flows](docs/08-ux-flows.md) | Screens, navigation, and the critical posting flow |
| 09 | [Security & Moderation](docs/09-security-moderation.md) | Abuse, rate limits, the report queue, trust & safety |
| 10 | [Roadmap](docs/10-roadmap.md) | Phased build plan, sized for solo nights-and-weekends |
| 11 | [Decisions & Open Questions](docs/11-decisions-and-open-questions.md) | The decision log and what's still unresolved |
| 12 | [Environment Setup](docs/12-environment-setup.md) | Running it locally, and the accounts/secrets only you can create |

---

## The one-paragraph version

An **Expo/React Native universal app** (iOS, Android, and a web export from one codebase)
talking directly to **Supabase** (Postgres + Auth + Storage) with Row Level Security as the
authorization layer and Postgres functions as the API. No custom backend server exists in v1.
Users sign in with a **Google account or an email magic link**. They type an experience in
free-form text; a live search steers them toward an existing Topic, and on submit an
**exact match ignoring case** joins that thread while anything else becomes a new Topic.
They pick **0–5 whole Kreams** and optionally add a ~150-character note. Their Kreami appears on the Topic's thread
and in the feeds of everyone who follows them. Everything is public. Total infrastructure cost
at launch: **$0**.

## Locked decisions

These came from the design interview and are settled unless deliberately revisited:

- **Scale:** whole Kreams only, 0–5. Six values. No halves, no decimals.
- **Platform:** Expo universal — one codebase for mobile and web.
- **Backend:** Supabase free tier. Postgres, Auth, Storage.
- **Auth:** Google OAuth + email magic link. No passwords.
- **Topics:** users type anything. An exact match ignoring case joins that thread; anything
  else is a new topic. No confirmation step, no fuzzy guessing.
- **Kreami shape:** short shared Topic title + rating + optional personal note.
- **v1 features:** follows, following feed, likes, replies, search, global discovery feed.
- **Ranking:** absolute ratings only. Beli-style pairwise comparison is designed for, not built.
- **Notifications:** in-app activity tab only. No push, no email.
- **Privacy:** everything public. Instant follows. Report queue for moderation.
- **No photos in v1.**

## Deliberately deferred

Photos · push notifications · private accounts · pairwise comparison ranking ·
semantic (embedding-based) topic clustering · native app store releases · direct messages ·
any form of monetization.
