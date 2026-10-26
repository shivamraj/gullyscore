# GullyScore

Live ball-by-ball scoring for local cricket (gully, school, college, corporate). One scorer taps buttons for every ball, viewers follow a live scoreboard, and an AI agent answers questions like "score kya hai?" or "who comes next?" from the live match data.

Built with Next.js, TypeScript, Tailwind CSS and Supabase. Runs on free tiers.

## Requirements

- Node.js 20 or newer
- Git
- GitHub CLI (`gh`) for opening PRs

## Run it locally (Windows PowerShell)

```powershell
# 1. Install dependencies (first time, and after package.json changes)
npm install

# 2. Create your local settings file from the example
Copy-Item .env.example .env.local

# 3. Start the dev server, then open http://localhost:3000
npm run dev
```

To open it on your phone, connect the phone to the same Wi-Fi and open `http://<your-computer-ip>:3000`. Find the IP with `ipconfig` (look for "IPv4 Address").

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the app with live reload |
| `npm run build` | Production build; fails on type errors |
| `npm run typecheck` | Checks TypeScript types only |
| `npm start` | Runs the production build |

## Environment variables

Keys go in `.env.local` (never committed). See `.env.example` for the list:

| Name | Needed from | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Phase 2 | Supabase › Project Settings › API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 2 | Supabase › Project Settings › API |
| `SUPABASE_SERVICE_ROLE_KEY` | Phase 2 | Supabase › Project Settings › API (keep secret) |
| `GEMINI_API_KEY` | Phase 5 | Google AI Studio › Get API key. **Needed for Ask**; without it Ask replies "isn't switched on". |
| `GEMINI_MODEL` | Optional | A different Gemini model than the default in `src/lib/agent/llm.ts`. |

## Put it live on Vercel (free)

Do this once. After that, every PR you merge into `main` goes live by itself in about a minute.

1. **Check the database is ready.** In Supabase › SQL Editor, `supabase/schema.sql` should already be run (you did this in PR 3). Nothing new is needed: the viewer count uses Realtime *presence*, which needs no table.
2. **Create the Vercel project.**
   - Sign in at [vercel.com](https://vercel.com) with your GitHub account.
   - **Add New › Project**, pick the `gullyscore` repo, then **Import**. Vercel spots Next.js by itself; leave the build settings as they are.
3. **Add the keys.** Before clicking Deploy, open **Environment Variables** and add the same four values as your `.env.local`:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase › Project Settings › API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase › Project Settings › API (secret) |
   | `GEMINI_API_KEY` | Google AI Studio › Get API key. Needed for Ask: without it, Ask replies "isn't switched on". |

   Paste them only into Vercel, never into chat, code or a commit.
4. **Deploy.** Click **Deploy** and wait for "Congratulations". Your app is at `https://gullyscore-<something>.vercel.app`. You can rename it under Settings › Domains.
5. **Check it.**
   - Open the URL on your phone, tap **Umpire login**, and create a test match (set up Google first: see the next section).
   - Keep the scorer open on that phone, and open the match from the home page on another phone.
   - Score a few balls: the viewer should update within a second, show the animations, and say "2 watching" when two people have the match open.

If you change a key later, update it in Vercel › Settings › Environment Variables, then **Deployments › ⋯ › Redeploy**.

Optional: check the production build on your computer first.

```powershell
npm run build
npm start   # then open http://localhost:3000
```

## Umpire login with Google (one-time setup)

Viewers never log in. Umpires sign in with Google to create and score matches, and only the umpire who created a match can score it. Do this once; no new keys go in `.env.local` or Vercel.

**A. Google Cloud: create the sign-in client**
1. Open https://console.cloud.google.com, top bar › **New project**, name it `GullyScore`, then select it.
2. Search for **"Google Auth Platform"** and open it.
3. **Branding:** app name `GullyScore`, your email as the support and contact email. Save.
4. **Audience:** choose **External**, then **Publish app** (otherwise only listed test users can sign in).
5. **Clients › Create client:**
   - **Application type:** Web application.
   - **Authorized JavaScript origins:** your live site (e.g. `https://gullyscore-sable.vercel.app`) and `http://localhost:3000`.
   - **Authorized redirect URIs:** `https://<your-project>.supabase.co/auth/v1/callback`. Copy the exact URL from Supabase's Google page (B2).
   - Click **Create** and copy the **Client ID** and **Client secret**.

**B. Supabase: turn on Google**
1. **Authentication › Sign In / Providers › Google**.
2. Switch it on, paste the Client ID and Client secret, and Save.
3. **Authentication › URL Configuration:**
   - **Site URL:** your live site.
   - **Redirect URLs:** add `<your live site>/**` and `http://localhost:3000/**`.

Until this is done, the login page says "Google sign-in isn't switched on yet".

**Test it locally:** `npm run dev`, open http://localhost:3000, tap **Umpire login › Continue with Google**, and you land on **My matches**. Phones on your Wi-Fi (`http://192.168.x.x:3000`) can watch, but Google sign-in only returns to addresses listed above, so log in on the computer or the live site.

## Install it on a phone (app icon on the home screen)

GullyScore is a PWA: it installs from the browser, no app store needed. Installing needs the live `https://` site (step 4 above). On `http://` addresses like your local Wi-Fi IP, it works but can't be installed.

- **Android (Chrome):** open the site, tap **⋮ › Install app** (or the "Install" banner).
- **iPhone / iPad (Safari):** open the site, tap **Share › Add to Home Screen**.

The installed app opens full screen and loads fast. If the phone goes offline, viewers see the last score they loaded instead of an error. The scorer screen is never cached: it saves balls through its own offline queue, which you already have.

## Launch checklist

Before sharing the link widely, try these on real devices (DEV-07):

| Device / browser | Check |
| --- | --- |
| Android phone, Chrome | Score a match end to end; install the app; turn the phone sideways on the scorer screen |
| iPhone, Safari | Watch a match with sound on (tap the page once first); Add to Home Screen |
| iPad or Android tablet | Scorecard sits beside the live view |
| Laptop: Chrome, Edge, Safari, Firefox | Home page shows matches in a grid; Ask opens as a chat window on the right |

## Project plan

The MVP was built in 8 phases and 14 PRs, each with at most 10 files:

| Phase | What |
| --- | --- |
| 0 | Project setup |
| 1 | Scoring engine + tests |
| 2 | Database and match setup |
| 3 | Scorer panel |
| 4 | Home page and live scoreboard |
| 5 | Chat agent |
| 6 | Animations, sounds, viewer count, tablet and desktop layouts (PR 13) |
| 7 | Installable app (PWA) and Vercel launch (PR 14) |

## Folder layout

```text
src/
  app/          pages and API routes (Next.js App Router)
  engine/       scoring logic (Phase 1)
  lib/          database, agent, scorer helpers
  hooks/        React hooks
  components/   UI pieces
supabase/       database schema
public/         service worker (sw.js)
```
