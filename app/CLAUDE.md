# app/ — Next.js Production App

This is the deployed application. All production UI, auth, server actions, API routes, and cron endpoints live here.

## Commands (run from `app/`)

```bash
npm run dev           # next dev :3000
npm run build         # next build
npm run typecheck     # tsc --noEmit (run before committing)
npm run gen:types     # regen lib/supabase/types.ts from local Supabase
npm run test          # vitest run
```

**Node 20 required.** Prefix one-shot commands with `PATH=$HOME/.nvm/versions/node/v20.20.2/bin:$PATH` — background bash tool calls don't share shell state so `nvm use 20 && ...` in another call won't carry.

## Deploying

**Always deploy from the repo root, never from `app/`.** The Vercel CLI resolves `.vercel/project.json` from CWD. The Vercel project has `rootDirectory: app` set in the dashboard — running from repo root is correct; Vercel applies that offset.

- Running `vercel deploy` from `app/` without a pre-populated `app/.vercel/project.json` silently creates a new garbage project named after CWD.
- Copying `.vercel/project.json` into `app/.vercel/` and deploying from `app/` also fails — Vercel tries to build `app/app/`, finds no `pages` or `app` dir.

## Route structure

```
app/app/
  page.tsx              landing page
  home/                 authenticated feed (activity + sidebar)
  film/[id]/            film detail
  films/                browse catalog
  for-you/              FYP ranked feed
  watchlist/            user's watchlist
  library/              owned films
  watched/              watch log
  lists/[id]/           curated lists
  p/[username]/         public profile
  coven/                coven graph
  settings/             account settings
  onboarding/           first-run flow
  ritual/               goblin pick ritual
  admin/                admin panel (requireAdmin guard)
  auth/                 signin / signup / forgot / reset / change-password
  invite/[code]/        invite landing (Route Handler, not Server Component)
  api/cron/*            cron endpoints secured by Authorization: Bearer $CRON_SECRET
  api/og/film/[id]      OG image generation via ImageResponse
```

## iOS PWA rules

Every page wrapper that fills the screen must use `100dvh` (not `100vh`) — dynamic viewport sizes correctly in Safari standalone mode. Plain `100vh` includes the URL bar's reserved space.

`TopNavChrome` pads itself with `paddingTop: "env(safe-area-inset-top)"`. Any new page with its own sticky chrome must do the same — content extends behind the notch when `statusBarStyle: "black-translucent"` is set in metadata.

## Environment variables

Production env lives in Vercel. Pull locally with `npx vercel env pull app/.env.local --yes` from repo root. Sensitive vars (`CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `BRAVE_SEARCH_API_KEY`) cannot be read from the Vercel dashboard after creation — see root CLAUDE.md for rotation procedures.
