# Deploying `kpr-web` to Vercel

## 1. Push this folder as its own repo

```bash
cd kpr-web
git init
git add .
git commit -m "Initial commit: consolidated KPR dashboard + API (Next.js)"
git branch -M main
git remote add origin https://github.com/<you>/KPR.git   # reuse the existing "KPR" repo, or a new one
git push -u origin main --force   # --force only if replacing the old static-HTML KPR repo contents
```

If you want to keep history from the old admin-portal repo, push to a new branch first and
open a PR instead of force-pushing `main`.

## 2. Import into Vercel

1. [vercel.com/new](https://vercel.com/new) → import the `KPR` repo.
2. Framework preset: **Next.js** (auto-detected). Root directory: `kpr-web` if the repo also
   contains other folders (e.g. you keep this inside the bigger `PWA tracker` workspace repo);
   otherwise leave as `.` if `kpr-web` is pushed as the repo root.
3. Add all environment variables from `.env.example` under **Settings → Environment Variables**
   (Production + Preview). At minimum:
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (paste the full service-account JSON as one line)
   - `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID`
   - `API_KEY` + `NEXT_PUBLIC_API_KEY` (same value — must match what the Flutter PWA sends)
   - `ADMIN_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_*` (public Firebase Web SDK config)
   - `EMAILJS_*` if you want PIN/fire-alert emails to keep working
   - `FIRMS_MAP_KEY`, `CRON_SECRET` if you want the daily fire-check cron
4. Deploy.

## 3. Point the PWA / other clients at the new API host

The Flutter PWA and any other client currently pointing at
`https://wildlife-tracker-gxz5.vercel.app` should be updated to the new Vercel URL for this
project (or keep the old backend project running in parallel until you've verified the new one,
then cut over).

## 4. Firestore security rules

No changes needed — this app talks to the same Firebase project/Firestore database
(`wildlifetracker-db`) as before, using the same Admin SDK service account server-side and the
same client SDK config in the browser.

## 5. Decommissioning the old projects (once verified)

Once `kpr-web` is live and verified:
- The old Vercel project for `backend api/` can be paused/removed.
- The old Vercel/static host for `web map+admin portal/` can be paused/removed.
- Those folders can stay in the workspace for reference, or be deleted — they are not depended
  on by anything else (the Flutter PWA talks to `/api/*`, not to the HTML pages).
