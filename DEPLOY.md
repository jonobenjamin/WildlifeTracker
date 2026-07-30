# Deploying `WildlifeTracker` to Vercel + GitHub Pages

This one folder is the entire `jonobenjamin/WildlifeTracker` repo: the Next.js dashboard/API
(deployed to Vercel) **and** the built PWA in `docs/` (served by GitHub Pages from the same
repo). `PWA Build/` (Flutter source) is a separate repo and is not part of this one.

## 1. Push this folder to GitHub

```bash
cd WildlifeTracker
git remote add origin https://github.com/jonobenjamin/WildlifeTracker.git   # already exists remotely
git add -A
git commit -m "Consolidate backend API + dashboard (Next.js) and PWA build output into one repo"
git push -u origin main
```

The remote repo already has production content (the old plain Express backend). Decide with
the team whether to:
- **Force-push** `main` to fully replace it with this new structure (only do this once you've
  verified everything locally — it rewrites history), or
- Push to a new branch and open a PR so you can review the diff first.

**Do not force-push without double-checking** — this overwrites what's currently live in
production on that repo.

## 2. Vercel project settings

1. [vercel.com/new](https://vercel.com/new) → import (or re-point the existing) `WildlifeTracker` project.
2. Framework preset: **Next.js** (auto-detected). Root directory: `.` (repo root — `app/`,
   `server/`, `pages/api/` etc. are all at the top level of this repo).
3. Add all environment variables from `.env.example` under **Settings → Environment Variables**
   (Production + Preview). At minimum:
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (paste the full service-account JSON as one line)
   - `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`
   - `API_KEY` + `NEXT_PUBLIC_API_KEY` (same value — must match what the Flutter PWA sends)
   - `ADMIN_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_*` (public Firebase Web SDK config)
   - `EMAILJS_*` if you want PIN/fire-alert emails to keep working
   - `FIRMS_MAP_KEY`, `CRON_SECRET` if you want the daily fire-check cron
   - `OKAVANGO_API_BASE=https://okavangowater.com`, `OKAVANGO_PARTNER_SLUG`, `OKAVANGO_API_KEY`
     (server-side only — used by `/api/okavango-water/*` to proxy historical water-extent PNGs;
     the partner key never reaches the browser)
4. Deploy. Vercel only builds the Next.js app — it ignores `docs/` (it's not referenced by
   `next.config.mjs` or `public/`), so having it in the repo doesn't affect the Vercel build.

### Okavango Water — quick test (after env vars are set)

```bash
# Catalog (published dates + Leaflet bounds)
curl -s "https://YOUR-VERCEL-HOST/api/okavango-water/catalog" \
  -H "x-api-key: $API_KEY" | head -c 800

# One frame PNG
curl -s -o /tmp/water.png -w "%{http_code} %{content_type}\n" \
  "https://YOUR-VERCEL-HOST/api/okavango-water/image?date=YYYYMMDD" \
  -H "x-api-key: $API_KEY"
```

Upstream partner endpoints (server-side only):
`GET https://okavangowater.com/api/partners/$OKAVANGO_PARTNER_SLUG`
and `.../image?date=YYYYMMDD` with header `X-API-Key: $OKAVANGO_API_KEY`.

## 3. GitHub Pages settings (for the PWA in `docs/`)

On the same `WildlifeTracker` repo: **Settings → Pages → Build and deployment → Deploy from a
branch → Branch: `main`, folder: `/docs`**. This replaces whatever repo/Pages source the PWA
used to be served from (e.g. a separate `KPR_PWA` repo) — going forward there's one repo for
both deployments.

## 4. Point the PWA / other clients at the new API host

The Flutter PWA and any other client currently pointing at
`https://wildlife-tracker-gxz5.vercel.app` (or whatever the old backend project's URL was)
should be updated to this Vercel project's URL.

## 5. Firestore security rules

No changes needed — this app talks to the same Firebase project/Firestore database
(`wildlifetracker-db`) as before, using the same Admin SDK service account server-side and the
same client SDK config in the browser.

## 6. Decommissioning old repos/projects (once verified)

Once this repo is live and verified on both Vercel and GitHub Pages:
- The old separate backend Vercel project can be paused/removed.
- The old `KPR_PWA` repo/Pages site (if it was previously the PWA's GitHub Pages source) can be
  retired in favour of this repo's `/docs`.
- Locally, the superseded `backend api/`, `web map+admin portal/`, and legacy `auth/`
  microservice folders have already been removed from the `PWA tracker` workspace as part of
  this consolidation.
