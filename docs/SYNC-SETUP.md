# Cross-device sync — one-time setup

FuelTrack normally keeps everything on-device. Cloud sync adds a tiny serverless
endpoint (`/api/sync`) backed by a Redis store, so your phone and iPad share one
account. You have to connect the storage once — it takes a couple of minutes and
is free for this scale.

## 1. Add Upstash Redis storage on Vercel

1. Open your FuelTrack project on [vercel.com](https://vercel.com).
2. Go to the **Storage** tab → **Create Database** (or **Connect Store**).
3. Pick **Upstash → Redis**, accept the free plan, and connect it to this project.
4. Vercel automatically injects the credentials as environment variables
   (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*`
   equivalents — the endpoint accepts either).

## 2. Redeploy

Trigger a new deployment (push a commit, or hit **Redeploy** in Vercel) so the
`/api/sync` function picks up the new environment variables. Until storage is
connected, the app will say *"Sync is not configured on the server yet."*

## 3. Turn sync on (on each device)

1. Open **Settings → Sync across devices → Turn sync on**. A random **sync code**
   is generated (e.g. `F9GY-KGW4-GN4R-4SEA`).
2. On your **other** device, open the same screen, turn sync on, and type the
   **exact same code** (or paste it — use **Copy** on the first device).
3. Tap **Sync now** on both. They now share one account and keep converging on
   their own after that (on open, on focus, and shortly after each change).

## How it behaves

- **Merge, not overwrite.** Log breakfast on your phone and lunch on your iPad and
  you get both. Edits use last-write-wins per item.
- **Deletes propagate.** Removing a meal on one device removes it everywhere and it
  won't reappear (tracked with deletion tombstones).
- **Synced:** meals, day flags (light days), weekly insights, targets/profile, and
  your API key. **Not synced:** meal photos — they stay on the device that took
  them, to keep the payload small and reliable.

## Security note

Your data — including your API key — lives in the cloud store under the hash of
your sync code. Anyone who knows the code can read it, so keep the code secret.
If you ever want to rotate it, generate a **New code** on one device and enter it
on the others (the old store is simply abandoned).
