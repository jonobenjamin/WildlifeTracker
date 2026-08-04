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

**Use only project `khwai-private-reserve`** (custom domain `khwaiprivate.okavangowater.com`).

Do **not** use the old Express project (`wildlife-tracker-gxz5` or similar). That project looks for
`server.js` / `index.js` and fails with:

> No entrypoint found. Searched for: app.js, index.js, server.js…

If that old project is still connected to the `WildlifeTracker` GitHub repo, every push will show a
failed build there even while `khwai-private-reserve` deploys fine. In Vercel → that old project →
**Settings → Git → Disconnect**, or delete/archive the project. Put all env vars (including Resend)
on **`khwai-private-reserve` only**.

1. [vercel.com/new](https://vercel.com/new) → import (or re-point) `WildlifeTracker` as **Next.js**.
2. Framework preset: **Next.js** (auto-detected). Root directory: `.` (repo root — `app/`,
   `server/`, `pages/api/` etc. are all at the top level of this repo).
3. Add all environment variables from `.env.example` under **Settings → Environment Variables**
   (Production + Preview). At minimum:
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (paste the full service-account JSON as one line)
   - `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`
   - `API_KEY` + `NEXT_PUBLIC_API_KEY` (same value — must match what the Flutter PWA sends)
   - `ADMIN_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_*` (public Firebase Web SDK config)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `EMAIL_FROM_NAME` for PIN login + alert emails
     (create a **new** Resend API key / verified domain for this project; then configure who
     gets alerts under Admin → Configure Notifications)
   - `FIRMS_MAP_KEY`, `CRON_SECRET` if you want the daily fire-check cron
   - `OKAVANGO_API_BASE=https://okavangowater.com`, `OKAVANGO_PARTNER_SLUG`, `OKAVANGO_API_KEY`
     (server-side only — used by `/api/okavango-water/*` to proxy historical water-extent PNGs;
     the partner key never reaches the browser)

### Resend setup (Okavango Water domain)

KPR emails must send from the already-verified **okavangowater.com** domain
(site: `https://khwaiprivate.okavangowater.com`).

1. In Vercel → Environment Variables (Production) set the **same** Resend API key you use for Okavango Water:
   - `RESEND_API_KEY=re_...` (existing key)
   - `RESEND_FROM_EMAIL=alerts@okavangowater.com`  
     (any mailbox on `okavangowater.com` is fine — e.g. `khwai@okavangowater.com` —
     as long as that domain is verified in Resend)
   - `EMAIL_FROM_NAME=KPR Wildlife Tracker`
2. Redeploy.
3. On the live site open **Admin → Configure Notifications** → confirm “Resend ready” → **Send test**.
4. Add rules (submission type → sub-items → users with email addresses).
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

## 3. Field PWA (`docs/`) on Vercel — `kpr-sightings.okavangowater.com`

The Flutter field app is the prebuilt contents of `docs/`. Deploy it as a **separate**
Vercel project from the Next.js API/dashboard (`khwai-private-reserve`).

1. Rebuild/publish with root base href (from the parent `PWA tracker` workspace):
   `./build-app.sh` → writes into `WildlifeTracker/docs/` with `<base href="/">`.
2. In Vercel → **Add New Project** → import `jonobenjamin/WildlifeTracker`.
3. Project settings:
   - **Root Directory:** `docs`
   - **Framework Preset:** Other
   - **Build Command:** leave empty
   - **Output Directory:** `.` (or leave blank so Vercel serves the root of `docs`)
4. Deploy, then **Settings → Domains** → add `kpr-sightings.okavangowater.com`.
5. DNS at `okavangowater.com`: **CNAME** `kpr-sightings` → `cname.vercel-dns.com`
   (or the target Vercel shows).
6. Do **not** attach this domain to `khwai-private-reserve` — that project is the
   Next.js API/dashboard at `khwaiprivate.okavangowater.com`.

The PWA continues to call the API at `https://khwaiprivate.okavangowater.com`
(auth + observations/trees). CORS already allows `*.okavangowater.com`.

GitHub Pages under `/docs` is optional/legacy once the Vercel domain is live.

## 4. Point the PWA / other clients at the API host

Field clients should use `https://khwaiprivate.okavangowater.com` (project
`khwai-private-reserve`), not the old Express project `wildlife-tracker-gxz5`.

## 5. Firestore security rules

No changes needed — this app talks to the same Firebase project/Firestore database
(`wildlifetracker-db`) as before, using the same Admin SDK service account server-side and the
same client SDK config in the browser.

## 6. Decommissioning old repos/projects (once verified)

Once this repo is live and verified on Vercel (API + PWA subdomain):
- The old separate backend Vercel project can be paused/removed.
- The old `KPR_PWA` / GitHub Pages PWA URL can be retired in favour of
  `https://kpr-sightings.okavangowater.com`.
- Locally, the superseded `backend api/`, `web map+admin portal/`, and legacy `auth/`
  microservice folders have already been removed from the `PWA tracker` workspace as part of
  this consolidation.
