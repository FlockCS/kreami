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

Fill `.env.local` with the **dev** project's values.

> **Copy the Project URL, not the REST URL.** The dashboard shows both, and the REST one
> ends in `/rest/v1`. Pasting that produces requests to `/rest/v1/rest/v1/...` which fail
> in confusing ways. The app now refuses to start with a clear message if the URL has any
> path on it, but it is still the easiest mistake to make on this page.


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
| `SUPABASE_SERVICE_ROLE_KEY` | **prod** service role key | `nightly.yml` |

`migrate.yml` targets a GitHub Environment named **`production`**. Create it under
**Settings → Environments** — add a required reviewer there if you want migrations to pause
for approval before touching prod.

> **Where the service role key may and may not go.** It bypasses RLS entirely. It must
> never reach the client bundle or any job that produces one — `deploy-web.yml` above all,
> which inlines every `EXPO_PUBLIC_*` variable it can see.
>
> `nightly.yml` is the one exception and needs it: reconciliation rewrites the counters
> that no client may touch (D16), so there is no anon-safe way to do the job. That is what
> docs/09's "service role key exists only in GitHub Actions secrets" means — Actions
> secrets, and nowhere a bundle is built. This note used to say "none of this", which was
> written before there was a job that legitimately needed it.

---

## Cloudflare Pages will not upload `node_modules`

Worth knowing before it costs you an afternoon. Pages refuses to upload anything under a
directory named `node_modules`, deliberately, on the assumption those are build-time
dependencies ([workers-sdk#3615](https://github.com/cloudflare/workers-sdk/issues/3615)).

Expo emits bundled assets to `dist/assets/node_modules/<package>/...` because it mirrors the
source path — so every font in the app was dropped from every deploy. The failure is
completely silent: the upload succeeds, the deploy is green, requests for the missing files
fall through to the SPA shell and return **200 `text/html`**, and `useFonts` takes the error
path that exists so a font failure does not hang the splash screen forever. The only symptom
is that the typography is wrong, and you have to look at the site to see it.

`deploy-web.yml` now renames the directory to `assets/vendor` and rewrites the references
before uploading. If you ever add another package that ships runtime assets, it is covered
by the same step — but the step fails the build if a reference survives, rather than
shipping half of one.

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

It calls a `keepalive()` SQL function rather than a health endpoint. That is deliberate: it
is the *Postgres instance* that pauses, and `/auth/v1/health` can answer without touching
the database. `/rest/v1/` is not an option either — that endpoint now requires the
`service_role` key, which must never reach CI.

One catch worth knowing now: **GitHub disables scheduled workflows in a repository with no
commit activity for 60 days.** If Kreami goes quiet over a long break, the cron stops, then
the database pauses. Re-enable it from the Actions tab when you come back.

---

## Phase 0 done-when

- [x] `npm run web` shows all four checks READY
- [x] A migration applied to `kreami-dev` from the CLI, not the dashboard
- [x] `npm run db:types` regenerated `database.types.ts`
- [x] All five workflows have run green at least once, with real secrets
- [x] `https://kreami.pages.dev` serves the app, against the **prod** project

> **Put the secrets at repository level, not in the `production` environment.** Only
> `migrate.yml` declares `environment: production`. Secrets scoped to that environment are
> invisible to `deploy-web`, `keepalive` and `nightly` — which is how this project spent a
> day with a deploy that failed every push and a nightly job that reported success while
> skipping its own body.

When those pass, Phase 0 is closed and [Phase 1 — Auth and identity](10-roadmap.md) starts.
