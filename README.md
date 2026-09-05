# Tip Track · NRL Tipping Tracker

A single-page family tipping app. Hosts on Netlify. Two-account model: Owner & Viewer.

## What's inside

```
.
├── index.html                   ← the app
├── netlify.toml                 ← Netlify config
├── package.json                 ← declares the @netlify/blobs dependency
├── netlify/functions/state.js   ← serverless API: /api/state and /api/auth
└── README.md                    ← you are here
```

## Two account types

- **Owner** (you) — full access. Mark winners, fetch scores/odds, import picks, run predictions, edit anything.
- **Viewer** (everyone else) — read-only. Sees standings, picks, scores, predictions. Cannot mark winners, cannot fetch APIs (the API tab is hidden), cannot edit picks.

## How accounts work

- One Owner password, one Viewer password. Both set during first-time setup.
- Stored as SHA-256 hashes on the server, with a per-comp salt. We can't see the raw passwords from the cloud blob.
- Sign-in lasts until you close the browser tab. Tick "Stay signed in" to persist.
- Tap the role pill in the header to sign out.
- **No password recovery.** If you forget either password, you'll need to reset the comp via Netlify dashboard.

## How sync works

- All data still saves to your browser instantly (the app works offline).
- Every save **debounces a push** to a single shared blob on Netlify (1.5 sec).
- Other devices **pull every 30 seconds** (and on tab focus) and merge changes per-tipster.
- Tap the sync indicator in the header to **force-sync now**.
- Conflict resolution is per-tipster: if you and your wife edit different tipsters' picks at the same time, both edits survive. If you edit the *same* tipster's pick, last-write wins.

## Deploy

### Drag-and-drop (~1 min)

1. Open <https://app.netlify.com/drop>
2. Log in
3. Drag this folder onto the drop zone
4. Wait ~30 seconds. Netlify gives you a URL like `https://wonderful-name-12345.netlify.app`
5. Open it. You'll see the **first-time setup screen**. Set your Owner and Viewer passwords.
6. Share the URL + Viewer password with the family.

### Updating an existing site

1. Go to your existing Tip Track site in Netlify
2. Tap "Deploys" → "Trigger deploy" or drag the new folder onto the deploys page
3. Make sure all 5 deploy steps complete (Initializing, Building, Deploying, Cleanup, Post-processing)

## Costs

- Netlify Functions: 125k invocations/month free → you'll use ~100/day → free forever for one comp
- Netlify Blobs: 100GB free → you'll use ~10KB → free forever
- The Odds API: 500 free requests/month → you'll use ~17/day → free for the season

## Troubleshooting

**Setup screen doesn't appear, just shows the app**
You probably already had data saved locally from before auth was added. Open browser dev tools → Application → Local Storage → delete the `tip-track-*` entries → reload.

**"Wrong password" but I'm sure it's right**
Caps lock? Different browser? Try clearing storage and signing in fresh. Check the deploy log to make sure `/api/auth` is responding (Netlify Functions tab).

**Sync indicator stuck on "Connecting…"**
The function probably isn't responding. Check Netlify dashboard → Functions tab → look for errors. Most common cause: `package.json` didn't deploy, so `@netlify/blobs` is missing. Re-deploy the whole folder.

**Want to reset all passwords**
Go to Netlify dashboard → Storage → Blobs → delete the `auth` blob. Reload the app — you'll get the setup screen again.

## Privacy note

The state and auth blobs live on Netlify's infra. The function endpoints are public (anyone with the URL can hit them). Authentication is enforced on the **client** — meaning a determined attacker who reads the source code could potentially extract data via direct API calls. For family use this is fine. For anything more sensitive you'd want server-side auth checks too.
