# 11 — Decisions & Open Questions

## Decision log

Decisions made during the design interview on **2026-08-24**. Each records what was chosen,
why, and what would justify revisiting it.

---

### D1 — The scale is 0–5 whole Kreams
**Chosen:** six discrete values, no halves.
**Why:** simplest possible input, cleanest aggregates, and 0/5 stays a punchy, meaningful
verdict rather than an absence of one.
**Reversal cost:** low. `update kreamis set rating = rating * 2`, widen the check constraint,
divide on display. About an hour.
**Revisit if:** ratings cluster hard at 4 and 5 and users say they need finer resolution.

---

### D2 — Expo universal, one codebase
**Chosen:** Expo Router with a web export, over a web-first Next.js app.
**Why:** one codebase for iOS, Android, and web, from a solo builder.
**Known cost:** the web export is a client-rendered SPA — poor SEO, no link previews without
extra work, heavier bundle. This was flagged during the interview and accepted.
**Mitigation:** the OpenGraph Worker in Phase 5.
**Revisit if:** organic search or link sharing becomes the primary growth channel. The fix at
that point is a small Next.js app for public pages, not a rewrite.

---

### D3 — Supabase, client-direct, RLS as authorization
**Chosen:** no backend server; the client talks to Postgres through PostgREST and RPCs.
**Why:** genuinely $0, and it's real Postgres — portable if Supabase is outgrown.
**Known cost:** RLS mistakes are silent data exposure, not errors. Business logic lives in
SQL, which is harder to test than application code.
**Revisit if:** you need logic that doesn't fit in SQL. Add Edge Functions before considering
a real backend.

---

### D4 — Free-form experience entry, exact-match resolution
**Chosen (revised 2026-08-24):** users type anything. An **exact match ignoring case** joins
that thread and cannot create a duplicate; anything else becomes a new Experience, with no
confirmation step. Normalization is lowercase, trim, collapse inner whitespace — nothing else.
**Why:** the simplest rule that is predictable to a user. No machine guess ever sits between
someone and posting, and "cannot create a duplicate" becomes a database guarantee rather than
an application convention.
**Superseded:** an earlier three-layer design with a fuzzy "Did you mean?" confirmation at a
0.72 similarity threshold. That screen is drawn but unrouted.
**Known cost, accepted:** this is deliberately the *under-merging* side of the tradeoff.
`candy apple` and `candy apples` are separate Experiences forever; so are `Jury duty` and
`Jury duty.` The whole cost lands on **median Kreamis per Experience** — see Q3 below.
**Full design:** [05 — Experience Matching](05-experience-matching.md).

---

### D5 — Short shared title + rating + optional note
**Chosen:** Experience titles capped at 80 characters; personal notes capped at 150.
**Why:** the title is a *shared label* others must be able to find and join, so it has to
stay short and generic. The note is where personality goes.
**Note:** this differs slightly from the original 150-char single-field idea — splitting them
is what makes shared threads possible at all.

---

### D6 — Google OAuth + email magic link. No passwords.
**Why:** no password storage, no reset flow, no credential-breach surface.
**Known cost:** a hard dependency on email deliverability. Resend's free tier is required;
Supabase's built-in SMTP is rate-limited into uselessness.
**Deliberately omitted:** Sign in with Apple — not needed until an iOS App Store release, at
which point it becomes **mandatory** because other social logins are offered.

---

### D7 — Everything public, instant follows, report queue
**Why:** Kreami is a consensus engine; private ratings contribute nothing. Simpler RLS,
simpler feeds, working shareable links.
**Known gap:** no user blocks in v1 — see Q1 below.

---

### D8 — Absolute ratings only; comparison ranking designed for, not built
**Why:** pairwise comparison assumes a comparable peer group. "Candy apple vs. jury duty" is
nonsense, and building a ranking system that produces nonsense is worse than not having one.
**Preserved:** nothing in the schema blocks adding a per-user ordering later.

---

### D9 — In-app notifications only
**Why:** zero infrastructure, zero cost, zero deliverability problems.
**Revisit if:** retention is the bottleneck. Expo push is free and is the obvious next lever.

---

### D10 — One Kreami per user per Experience, editable forever
**Why:** prevents ballot-stuffing and keeps averages meaningful.
**Known cost:** you can't record rating the same experience twice at different times
(the Letterboxd "rewatch" case). Accepted — the average matters more than the diary.

---

### D11 — Averages hidden below 3 Kreamis
**Why:** "5.0 Kreams" from a single rating is a false signal, and it makes every new Experience
look artificially good.

---

### D12 — Cloudflare Pages, not Vercel Hobby
**Why:** Vercel's Hobby tier prohibits commercial use. Kreami is non-commercial today, but
any future monetization would put the deployment in violation. Cloudflare has no such clause
and unlimited free bandwidth.

---

### D13 — No categories or tags in v1
**Why:** categorizing "literally anything" is an unbounded taxonomy problem, and a category
picker adds friction to the ten-second post. Search and recency handle discovery.
**Revisit if:** search proves insufficient and users can't find experiences they know exist.

---

---

### D14 — Corrected neutrals for WCAG AA
**Chosen (2026-08-25):** darken the neutral ramp so text and the Kream glyph meet WCAG AA,
and collapse `muted` and `faint` into one tone.

| Token | Was | Now | Ratio on `#FAF7F1` |
|-------|-----|-----|--------------------|
| `muted` | `#8C8177` (3.56:1) | `#786F66` | **4.61:1** |
| `faint` | `#B0A597` (2.26:1) | *removed* — use `muted` | — |
| `empty` | `#CFC4B4` (1.61:1) | `#958D82` | **3.06:1** |

**Why:** the original palette failed the 4.5:1 floor that
[08 — UX Flows](08-ux-flows.md) already committed to. The load-bearing failure was `empty`,
the *unfilled* Kream glyph, at 1.61:1 — at that ratio you cannot count the empty dollops, so
a 2/5 and a 4/5 look alike and the glyph row stops carrying the rating. That undermines the
whole premise of the scale.

**Why one tone instead of two:** pushed to 4.5:1 independently, `muted` and `faint` land
0.1% apart in luminance — indistinguishable. Keeping both would have been a token that lied.
Secondary hierarchy is now carried by size and weight.

**Applied to:** `tailwind.config.js`, `src/theme/tokens.ts`, and all nine
`design/screens/*.dc.html` artboards. The A/B/C direction study was deliberately left on the
original palette — it is the record of that decision, not live design.

**Cost, accepted:** metadata is slightly heavier than drawn. The airiness of the direction
comes from whitespace and the serif, not from pale metadata, so the character survives.

---

### D15 — `handle` is nullable until claimed
**Chosen (2026-08-25):** a profile row is created by trigger the moment an auth user exists,
with `handle` null until the person picks one through `claim_handle()`.
**Why:** the trigger is what keeps the app from ever reading `auth.users` directly (D3's
portability rule), but nobody has a handle at signup. A null handle is an honest "signed up,
not yet onboarded" signal. Generating `user_a3f9` placeholders would pollute the namespace
and make the first claim a *change*, subject to the 30-day cooldown.
**Consequence:** every public read of `profiles` filters `handle is not null`. A
half-onboarded account is invisible to everyone but itself.
**Revised from:** [04 — Data Model](04-data-model.md), which specified `not null`.

---

### D16 — Column grants, not trust, protect handles and counters
**Chosen:** `revoke all on profiles`, then `grant update (display_name, bio, avatar_url)`.
**Why:** RLS decides which *rows* you may touch; it cannot stop you writing a column you
should not. Without column grants, any signed-in user could `PATCH` their own
`follower_count` or take a handle directly, bypassing the cooldown and the reservation list
entirely. Counters are trigger-maintained and handles go through `claim_handle()`, so
neither should be client-writable at all.

---

### D17 — "Experience", not "Topic"
**Chosen (2026-08-25):** the shared thing a Kreami attaches to is an **Experience**
everywhere — UI, schema, functions, routes (`/e/:slug`) and docs.

**Why:** the product was always about experiences —
[01 — Product Vision](01-product-vision.md) opens with "a social rating app for experiences"
and the compose field already asked "What did you experience?" — while the schema said
"topic". [02 — Domain Model](02-domain-model.md) calls the vocabulary load-bearing, and this
was the one place it had drifted.

"Topic" is forum vocabulary: topics are things you *discuss*, experiences are things you
*have*. It also said nothing about what makes Kreami different. Letterboxd has films, Beli
has restaurants, Kreami has experiences.

**An unplanned benefit:** "experience" quietly pressures people toward verb phrases — "eating
a candy apple" rather than "candy apple". Verb-phrased titles are more specific and collide
less, so they dedupe *better* under the exact-match rule. The word does some of the work the
matching pipeline would otherwise have to.

**Known cost:** not everything rated is strictly an experience — "candy apple lip gloss" is a
product, "the first cold day of fall" is a phenomenon. "Experience" stretches to cover them
(you experience them) but not perfectly. "Topic" covered them no better and cost the
differentiator.

**Timing:** done at the cheapest possible moment — zero experiences existed, no URLs had been
shared, and the client did not reference the tables yet. After launch this would touch shared
links and muscle memory.

---

### D18 — Replies are cut from v1
**Chosen (2026-08-25):** the `replies` table, its counter trigger and `post_reply()` stay in
the schema, but the function is granted to nobody and no surface reads or writes one. The
`↩` counter is gone from the feed card.

**Why:** a rating is aimed at an *experience*; a reply is aimed at a *person*. Replies are
where harassment lands, and Kreami has no block feature — Q1 below. Shipping replies is what
turns that gap from theoretical into urgent, and blocks are not built.

**Why revoke rather than only hide the UI:** a write path with no read path is the worst of
both. Anyone could post replies through the API, nobody would ever see them, and the rows
would still accumulate and still need moderating. Hiding the button would have made the cut
nominal rather than real.

**The counter was lying.** Every feed card showed `↩ 3` for something with no way to read or
write it. Removing it is the honest state while there is no reply surface.

**Cost:** Kreami loses conversation. Letterboxd got a long way on ratings and likes alone, so
this is survivable, and the thread on an experience is still a conversation of a kind — just
one conducted in ratings rather than comments.

**Reversing it** is a single `grant execute on function public.post_reply(uuid, text) to
authenticated`, plus the UI. Do it after blocks, not before.

## Open questions

Things genuinely unresolved. Each needs an answer eventually; none blocks Phase 0.

### Q1 — Blocks are missing, and that's a real gap ⚠️
A public app with replies and no block feature leaves a harassed user with no recourse but
to report or quit. Reporting handles content; it doesn't handle *a person*.
**Recommendation:** treat a mutual-invisibility block as the first thing you build the moment
any harassment appears, ahead of everything on the roadmap. Consider building it in Phase 5
preemptively — it's roughly one table and three policy changes.

### Q2 — What does a Kream *look like*?
The glyph is the entire visual identity and is not yet designed. It has to read at 16 pt, work
in one flat color, and survive being screenshotted out of context. This is a real design task,
not a placeholder-icon task, and it gates the visual work in Phase 2.

### Q3 — Does the exact-match rule fragment the corpus? ⚠️
The open question that matters most. Under D4, every phrasing difference is a separate Experience,
and nothing repairs that except manual merging.

**The measurement:** median Kreamis per Experience among Experiences older than 7 days, plus the share
of resolutions logging `new` that are near-misses of an existing Experience.

**The remedies, in order of cost:** strip punctuation in `normalize_experience_title`; then merge
aggressively from the nightly duplicate report (each merge writes an alias, so the fix
compounds); then reinstate the fuzzy confirmation step, which is already designed and drawn.

**Do not skip `experience_resolution_log` in Phase 2** — without it this question cannot be
answered and the decision cannot be revisited on evidence.

### Q4 — What happens to a Experience when everyone deletes their Kreami?
Currently it lingers with `kreami_count = 0`, hidden from discovery but reachable by URL.
Probably fine. Alternative: soft-delete after 30 days at zero.

### Q5 — Should users be able to propose merges?
Admin-only merging doesn't scale past a few hundred active users. A "these are the same
experience" report reason exists in the enum; whether it becomes a vote-based auto-merge is
open. Auto-merging is dangerous — it's user-triggered destructive action on shared data.

### Q6 — Handle changes
Currently intended to be gated by an RPC with a cooldown, to prevent impersonation via handle
recycling. Cooldown length (30 days?) and reservation period (90 days?) are guesses.

### Q7 — How do you seed the first hundred Experiences?
Phase 5 says "write 50–100 yourself," which is correct but unspecified. Which experiences?
The ideal seed is *maximally universal and mildly contentious* — things everyone has done and
disagrees about. That list is worth writing deliberately rather than improvising.

### Q8 — Is "Kreamer" actually the word for a user?
Flagged as possibly too much. Unresolved. The app works fine without ever naming users.

### Q9 — Moderation at real volume
The report queue is a SQL view reviewed by one person. That works at 50 users and fails at
5,000. No plan exists beyond that point, and none is needed yet — but it will need one before
any growth push.

### Q10 — Is there a monetization path at all?
Explicitly out of scope, and worth keeping out of scope. Noted only because D12 (Cloudflare
over Vercel) is a decision made *specifically* to preserve the option.

---

## How to use this document

When a decision above gets revisited, **edit it in place** — record the new choice, the date,
and what changed — rather than appending a contradicting note elsewhere. When an open question
gets answered, move it up into the decision log with the same structure.

The value of this file is that it's the one place where "why is it like this?" has an answer.
That's only true if it stays current.
