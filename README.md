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
| `GEMINI_API_KEY` | Phase 5 | Google AI Studio › Get API key |

## Project plan

The MVP is built in 8 phases and 12 PRs, each PR with at most 10 files:

| Phase | What |
| --- | --- |
| 0 | Project setup (this PR) |
| 1 | Scoring engine + tests |
| 2 | Database and match setup |
| 3 | Scorer panel |
| 4 | Home page and live scoreboard |
| 5 | Chat agent |
| 6 | Animations, sounds, viewer count |
| 7 | PWA and deploy |

## Folder layout

```text
src/
  app/          pages and API routes (Next.js App Router)
  engine/       scoring logic (Phase 1)
  lib/          database, agent, scorer helpers
  hooks/        React hooks
  components/   UI pieces
supabase/       database schema
public/         icons, sounds, manifest
```
