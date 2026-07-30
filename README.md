# KPR Wildlife Monitoring — Web (dashboard + API)

A single Next.js app that replaces the old static HTML admin portal (`web map+admin portal/`)
and the standalone Express API (`backend api/`). Both now live in **one repo** and deploy
as **one Vercel project**.

## What's inside

```
kpr-web/
  app/                 # Pages (App Router): login, map, map-users, admin, reports, vehicles, profile
  components/          # Shared UI: AppShell (sidebar/topbar), LeafletMap, MapLegend, ChartCanvas
  lib/                 # Firebase client/admin, auth context, API helpers, server actions
  server/              # The original Express app (api/*.js, services/*.js) — logic unchanged
  pages/api/[...path].js  # Bridges the Express app into Next.js so /api/* keeps working as-is
  public/data/         # Static GeoJSON + icons served directly to the browser
```

### Why keep the Express app instead of rewriting every route?

`server/` is the exact same route handlers (`observations`, `trees`, `tracking`, `fires`,
`water-monitoring`, `auth`, `admin`, `map`, `cron/fire-check`) that already work in production
against Firestore. Rewriting nine data-integrity-sensitive routes from scratch would be high
risk for little benefit — instead, `pages/api/[...path].js` exports the Express app directly
(Next.js Pages API routes are plain Node `(req, res)` handlers, and so is an Express app), so
every existing endpoint is available at the same paths, in the same repo, on the same Vercel
deployment as the dashboard.

The dashboard itself (`app/`, `components/`) **is** a full rewrite — real React/Next.js pages
with a shared sidebar/topbar layout, replacing the old collection of static HTML files.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
npm run dev
```

Visit `http://localhost:3000`.

## Environment variables

See `.env.example`. Three groups:

1. **`NEXT_PUBLIC_FIREBASE_*`** — public Firebase Web SDK config (same project as the PWA).
2. **`FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`** — server-side Firebase Admin, used by every `/api/*` route.
3. **`API_KEY` / `NEXT_PUBLIC_API_KEY`** — the shared key the Flutter PWA already sends as `x-api-key` on `/api/observations`, `/api/trees`, `/api/tracking`, `/api/map`, `/api/water-monitoring`. Same value on both sides.
4. **`ADMIN_API_KEY`** — protects `/api/admin/*` (user management). Kept server-only; the dashboard calls it through Next.js Server Actions (`lib/actions/adminUsers.js`) so this key never reaches the browser.
5. **`EMAILJS_*`, `FIRMS_MAP_KEY`, `CRON_SECRET`** — fire-alert emails, PIN emails, NASA FIRMS fire data, and the daily Vercel Cron fire check.

## Deploying

See [`DEPLOY.md`](./DEPLOY.md).

## Pages

| Route | Who | Replaces |
|---|---|---|
| `/login` | everyone | `login.html` |
| `/map` | admin | `map.html` (core layers: boundary, roads, camps, POI, trees, sightings/incidents/maintenance) |
| `/map-users` | admin, user, viewer | `map-users.html` |
| `/admin` | admin | `admin.html` / `user-submissions.html` (user management + submission counts) |
| `/reports` | admin | `reporting.html` |
| `/vehicles` | admin | `vehicle-tracker.html` |
| `/profile` | everyone | `profile.html` |

## Note on the PWA

The Flutter field PWA (`PWA Build/` source, `docs/` build output) is intentionally **not**
part of this repo/deployment — it stays in its own repo deployed to GitHub Pages, per the
project's split: this repo is the website/dashboard on Vercel, the PWA is the offline field
app on GitHub Pages.
