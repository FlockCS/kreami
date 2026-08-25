# 12 — Environment Setup

The Phase 0 scaffold is in place. What remains needs accounts, so it needs you.
Work top to bottom; each step tells you exactly what to copy where.

---

## 1. Run it locally (2 minutes, no accounts needed)

```bash
npm install
npm run web
```

You should get the Phase 0 foundation screen: Kreami in Instrument Serif, three checks
reading READY, and Supabase reading PENDING. That last one turns READY after step 2.

Also available: `npm run ios`, `npm run android`, `npm start`.

> **Node version.** This machine is on Node 25, which is not an LTS release and is not a
> version Expo tests against. It works today — the scaffold typechecks, lints, and exports
> cleanly on it — but if you hit a strange Metro or Babel error, dropping to Node 22 is the
> first thing to try. CI is pinned to 22 already.

---

## 2. Create the two Supabase projects

Free tier allows two, which is exactly what the plan needs.

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Create **`kreami-dev`**. Pick a region near you. **Save the database password** — it is
   shown once and CI needs it later.
3. Create **`kreami-prod`** the same way, with a *different* password.

For each project, go to **Project Settings → Data API** and copy the **Project URL** and the
**anon / public** key.

Then, locally:

```bash
cp .env.example .env.local
```

Fill `.env.local` with the **dev** project's values:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-DEV-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_PROJECT_ID=YOUR-DEV-REF
```

`.env.local` is gitignored. The anon key is public by design — it ships in the app bundle,
and Row Level Security is what actually protects the data. See
[09 — Security & Moderation](09-security-moderation.md).

Restart `npm run web`; the Supabase row should now read READY.

---

## 3. Apply the first migration

This proves the pipeline the whole project depends on: schema changes reach the database
from a file in the repo, never from the dashboard.

```bash
npx supabase login
npx supabase link --project-ref YOUR-DEV-REF
npx supabase db push
```

`supabase/migrations/20260825000000_enable_extensions.sql` should apply. It only enables
`uuid-ossp`, `pg_trgm`, and `unaccent` — tables start in Phase 1.

Then generate types from the live schema:

```bash
npm run db:types
```

That overwrites `src/lib/database.types.ts`, which is currently a hand-written placeholder.
**Never hand-edit that file.**

---

## 4. Create the Cloudflare Pages project

**Not Vercel** — its Hobby tier prohibits commercial use, which would bite the day Kreami
earns anything. See [03 — Architecture](03-architecture.md).

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git** is *not* what we want; choose **Direct Upload** and name
   the project **`kreami`**. CI does the building and uploading.
2. Copy your **Account ID** from the Workers & Pages sidebar.
3. **My Profile → API Tokens → Create Token → Edit Cloudflare Workers** template (or a
   custom token with `Account → Cloudflare Pages → Edit`). Copy the token once.

---

## 5. Add the GitHub secrets

`https://github.com/FlockCS/kreami/settings/secrets/actions`

| Secret | Value | Used by |
|--------|-------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | `migrate.yml` |
| `SUPABASE_PROD_PROJECT_ID` | prod project ref | `migrate.yml` |
| `SUPABASE_PROD_DB_PASSWORD` | prod database password from step 2 | `migrate.yml` |
| `EXPO_PUBLIC_SUPABASE_URL` | **prod** project URL | `deploy-web.yml`, `keepalive.yml` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **prod** anon key | `deploy-web.yml`, `keepalive.yml` |
| `CLOUDFLARE_API_TOKEN` | from step 4 | `deploy-web.yml` |
| `CLOUDFLARE_ACCOUNT_ID` | from step 4 | `deploy-web.yml` |
| `DEV_SUPABASE_URL` | dev project URL | `keepalive.yml` (optional) |
| `DEV_SUPABASE_ANON_KEY` | dev anon key | `keepalive.yml` (optional) |

`migrate.yml` targets a GitHub Environment named **`production`**. Create it under
**Settings → Environments** — add a required reviewer there if you want migrations to pause
for approval before touching prod.

> **The service role key belongs in none of this.** It bypasses RLS entirely and must never
> reach the client bundle or a build that produces one.

---

## 6. Verify the pipelines

```bash
gh workflow run keepalive.yml
gh run watch
```

Then push a trivial commit and confirm `ci.yml` and `deploy-web.yml` both go green. Your
site lands at `https://kreami.pages.dev`.

---

## The keepalive matters more than it looks

Supabase pauses free projects after ~7 days of inactivity, and a paused project is a dead
app. `keepalive.yml` runs every three days to prevent that.

One catch worth knowing now: **GitHub disables scheduled workflows in a repository with no
commit activity for 60 days.** If Kreami goes quiet over a long break, the cron stops, then
the database pauses. Re-enable it from the Actions tab when you come back.

---

## Phase 0 done-when

- [ ] `npm run web` shows all four checks READY
- [ ] A migration applied to `kreami-dev` from the CLI, not the dashboard
- [ ] `npm run db:types` regenerated `database.types.ts`
- [ ] All four workflows have run green at least once
- [ ] `https://kreami.pages.dev` serves the foundation screen

When those pass, Phase 0 is closed and [Phase 1 — Auth and identity](10-roadmap.md) starts.
