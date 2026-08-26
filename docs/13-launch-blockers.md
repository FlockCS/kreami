# 13 — What's blocked on you

Everything here needs an account, a payment method, or a judgement call that isn't mine to
make. The code side of each one is either done or is one small commit once you've done your
half — that's noted per item.

Ordered by what blocks what. Steps 1–3 unblock deployment; 4–6 unblock the private beta.

[12 — Environment Setup](12-environment-setup.md) covers the Supabase and Cloudflare
accounts themselves and is still accurate. This picks up where it stops.

---

## 1. The prod project and the deploy pipeline

**Blocks:** everything below it. Nothing has ever run against production because production
does not exist.

Follow [12 — steps 2, 4 and 5](12-environment-setup.md) as written, with one addition: the
secrets table there now includes `SUPABASE_SERVICE_ROLE_KEY`, which `nightly.yml` needs and
which arrived after that doc was written.

Then:

```bash
gh workflow run keepalive.yml && gh run watch
gh workflow run nightly.yml && gh run watch
```

`nightly.yml` prints what it did. A first run against a fresh prod database should read
four zeros — no drift, nothing pruned, nothing queued. A non-zero `counter_drift` on a
database nobody has used means a trigger is wrong, and is worth stopping for.

**Done when:** all five workflows have gone green once and `https://kreami.pages.dev` serves
the app.

---

## 2. Turn email confirmation back on

**Blocks:** anyone but you signing up. **Two clicks, and the easiest thing here to forget.**

It is currently **off** on `kreami-dev`, which is what makes `npm run e2e` able to create
throwaway accounts. With it off, anyone can register an address they do not own.

Supabase dashboard → **Authentication → Sign In / Providers → Email** → enable **Confirm
email**. Do it on **prod**, and leave dev as it is — turning it on there breaks `e2e`.

> If you ever want e2e to run against prod, don't. It creates and deletes real accounts.

---

## 3. Resend SMTP

**Blocks:** magic links working for real users.

Supabase's built-in sender allows roughly 2–4 emails an hour and fails silently past that —
the user sees a link that never arrives.

1. [resend.com](https://resend.com) → sign up → **Domains** → add yours and complete the DNS
   records. (No domain yet? Resend's shared sending domain works for testing but lands in
   spam often enough that it isn't a launch answer.)
2. **API Keys** → create one with *Sending access*.
3. Supabase → **Project Settings → Authentication → SMTP Settings** → enable custom SMTP:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = the API key
   - Sender email on the domain you verified
4. Send yourself a magic link **and open it on a phone**, not just the desktop browser.

Deep links on device are the part that breaks, and it is [in
BACKLOG](../BACKLOG.md) as its own item for that reason.

---

## 4. Rotate the dev service-role key

**Blocks:** nothing. Do it anyway, and it takes one click.

Retrieving it earlier printed it in full to a terminal, so it exists in scrollback. Dev
project, no real data, low practical risk — but the fix is free.

Supabase → **Project Settings → API → Legacy keys → service_role → Rotate**, then update
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

---

## 5. Sentry

**Blocks:** knowing when something breaks for somebody who is not you.

Free tier is 5k errors/month, which is far more than this will produce.

1. [sentry.io](https://sentry.io) → new project → platform **React Native**. Copy the DSN.
2. **Settings → Developer Settings → Auth Tokens** → create an org auth token (for source
   maps).
3. In the repo:

   ```bash
   npx @sentry/wizard@latest -i reactNative
   ```

   The wizard installs `@sentry/react-native`, wires the Metro config, and adds the
   `init()` call. Expo's guide is the reference:
   <https://docs.expo.dev/guides/using-sentry/>

4. Add `SENTRY_AUTH_TOKEN` to GitHub Actions secrets so `deploy-web.yml` can upload source
   maps. Without it Sentry still works, but every stack trace points at minified code.

**Two things to get right, because they are easy to get wrong:**

- **The DSN is not a secret** and belongs in `app.json` / `EXPO_PUBLIC_SENTRY_DSN`. The
  **auth token is** and must never be `EXPO_PUBLIC_*` — that prefix inlines it into the
  bundle.
- **Turn `sendDefaultPii` off.** Kreami's whole moderation posture is that content is
  public and identity is not incidental; shipping request bodies to a third party quietly
  undoes that.

**Wired as of the Sentry commit.** `Sentry.init()` and `Sentry.wrap()` are in
`src/app/_layout.tsx`, and `metro.config.js` composes Sentry's config with NativeWind's.
Reporting is off in development so local crashes do not spend the 5k/month quota.

Two things still outstanding, both yours:

- **Source maps.** Add the `@sentry/react-native/expo` plugin to `app.json` with your org
  and project *slugs* (not the numeric ids in the DSN), and put `SENTRY_AUTH_TOKEN` in
  Actions secrets. Without these, Sentry works but every web stack trace points at minified
  code. Note Sentry's own docs say source-map upload "currently doesn't work on web" — so
  this mainly buys you readable native traces later.
- **Decide on the bundle cost.** Sentry adds 1.58 MB uncompressed / ~380 KB gzipped to the
  web bundle, which nearly doubles it. See BACKLOG for the fix.

---

## 6. OpenGraph link previews

**Blocks:** sharing being worth anything. Right now `/e/:slug` renders a blank preview card
in every app it is pasted into — and those are exactly the URLs people share.

**Needs:** step 1 done, because it deploys as part of the Pages project.

The static export can't do this: it produces one HTML shell for every route, so there is
nowhere for per-experience `<meta>` tags to live. The fix is a **Pages Function** — a
Worker that runs in front of the static asset, fetches the experience from Supabase with
the anon key, and returns HTML with real `og:title` and `og:description` when the requester
is a crawler.

It lives at `functions/e/[slug].js` in this repo and deploys automatically with the site.
Nothing about it needs an account **except somewhere to deploy it**, so:

**Say the word and I'll write it now** — it only becomes testable once step 1 exists, but
it can be written and reviewed before then. Verifying it afterwards is
`https://cards-dev.twitter.com/validator` or just pasting a link into Slack.

---

## 7. Seed 50–100 experiences

**Blocks:** the private beta, and it is not optional. An empty rating app is unusable: the
first ten users each create one lonely experience and leave.

**This one is genuinely yours** — it is [docs/11 Q7](11-decisions-and-open-questions.md),
an open question, and seeding badly is worse than not seeding, because every bad seed is a
thread nobody joins that still shows up in Discover forever.

What the docs say a good seed looks like:

- **Maximally universal.** Everyone has done it. "Waiting for a kettle to boil", not
  "waiting for the 43 bus".
- **Mildly contentious.** The interesting number is disagreement — an experience everyone
  rates 5 is a dead thread. "Airport at 3am" works because people genuinely differ.
- **Phrased the way somebody would type it.** This is the whole exact-match bet: your seed
  titles are the strings other people have to land on. The first real post in this database
  was *"Chilling at the airport at 3 AM cause the airport don't wake up until 5:30"*, which
  nobody will ever type again. Write titles somebody else would independently write.

Write the list, and I'll write the script that posts them — as one seed account, spread
over plausible timestamps, so Discover isn't fifty things posted in the same second.

**Then watch [the number](10-roadmap.md#phase-6--private-beta-ongoing):**
`select * from admin_matching_stats;` — `median_kreamis_per_experience` sitting at 1.0
means exact-match is fragmenting the corpus, and the remedies are ordered in
[docs/05](05-experience-matching.md).

---

## Not blocked on you, but worth knowing

These need no account and are waiting on a decision about priority, not access:

- **Reporting has no way in.** The machinery is built and verified; the entry points are
  unlinked because REPORT under every Kreami looked wrong. Needs an overflow menu.
- **User blocks.** Still the thing that must exist before replies come back.
- **Google avatars are hotlinked** from `lh3.googleusercontent.com`, which Brave blocks and
  which tells Google who is looking at whom.

All three are in [BACKLOG](../BACKLOG.md) with their triggers.
