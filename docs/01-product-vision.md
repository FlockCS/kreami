# 01 — Product Vision

## The idea

Every rating app on earth is vertical. Letterboxd rates films. Beli rates restaurants.
Goodreads rates books. Untappd rates beer. Each one built a whole social graph, a whole
taste profile, a whole ranking system — and then locked it inside a single category.

**Kreami is horizontal.** One scale, zero categories. If you experienced it, you can rate it.

The bet is that the *universality* is the product. The joy isn't in discovering whether
a candy apple is good — you already know. It's in seeing that 47 strangers agree it's a
4/5 experience, that one person gave it a 0, and in reading why.

## Vocabulary

This language is load-bearing. Use it in the UI, in the code, in the schema.

| Term | Meaning |
|------|---------|
| **Kream** | The unit of rating. "I gave it four Kreams." |
| **Kreami** | One person's rating of one experience. A noun. "Leave a Kreami on it." |
| **Experience** | A shared experience that Kreamis attach to. Has a title and an average. |
| **Thread** | The list of Kreamis on a Experience, newest or best first. |
| **Kreamer** | A user. (Optional flavor — use sparingly, it's a lot.) |

The scale is **0 to 5 whole Kreams**. Six values, no halves.
Zero is a real, usable, meaningful rating — not an absence of rating. That matters:
"jury duty, 0/5 Kreams" is the funniest and most honest thing the app can produce, and
a scale that starts at 1 loses it.

## Who it's for

**The primary user is someone who already narrates their life in ratings** — the person who
says "8/10 morning" out loud, who rates their sandwich to their friends, whose group chat
has running bits about how good or bad ordinary things are. Kreami gives that instinct a home
and a scoreboard.

Two secondary motivations keep them coming back:

1. **Consensus discovery.** "Am I the only one who thinks this?" The thread answers it.
2. **Your own archive.** A profile becomes a strange, funny, honest record of your year.

## Product principles

1. **Posting must take under ten seconds.** Type, tap a number, done. The optional note is
   optional. Every second of friction here is the whole product dying quietly.
2. **Never block a user from rating something.** If the dedupe pipeline can't find a match,
   it creates a Experience. The user never sees an error, never gets told their experience is
   invalid, never has to phrase it "correctly."
3. **The scale is sacred.** No custom scales, no per-category scales, no "out of 10" mode.
   The universality of the number is the entire premise.
4. **Public by default.** This is a consensus engine. Private ratings contribute nothing.
5. **Text-first.** No photos in v1. The constraint keeps posts fast, cheap, and about the
   experience rather than the aesthetics of the experience.
6. **Cold start is the real enemy.** Every design decision about experience matching exists to
   make threads *dense* — many Kreamis on few Experiences — rather than a graveyard of
   one-rating experiences. See [05 — Experience Matching](05-experience-matching.md).

## What Kreami is not

- **Not a review site.** Notes are ~150 characters. There is no long-form review.
- **Not a recommendation engine.** No algorithmic "you might like." Chronological feed.
- **Not a places app.** No maps, no check-ins, no business listings, no Google Places
  integration. "Eating at Joe's Pizza" is a Experience like any other — it gets no special
  entity treatment. This is the single biggest thing that separates Kreami from Beli,
  and it's what keeps the scope and the hosting bill small.
- **Not a marketplace.** No monetization path in the plan. Not now.

## Success signals for v1

Not revenue. Not MAU. The things that tell you the premise holds:

- **Thread density:** median Kreamis per Experience > 1 among experiences older than a week.
  If this stays at 1.0, deduplication is failing and the product doesn't work.
- **Repeat posting:** a user's second Kreami within 48 hours of their first.
- **Follow reciprocity:** people finding people worth following.
- **The screenshot test:** does anyone voluntarily screenshot a Kreami and send it to a
  friend? That's the only viral loop the app has in v1.
