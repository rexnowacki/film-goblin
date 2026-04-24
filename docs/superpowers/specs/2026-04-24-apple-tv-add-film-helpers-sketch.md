# Apple TV "Add Film" helpers — design sketch

**Status:** pre-spec. Captured 2026-04-24 after iTunes Search was found to be broken for modern Apple TV titles (Suspiria, Midsommar, Send Help — all sellable on Apple TV, zero results from `itunes.apple.com/search`). Brainstorm this tomorrow to decide which path(s) to ship.

## Problem

Admins need a fast way to add films to Film Goblin with correct metadata + a working iTunes trackId for price tracking. Today's options:

1. **iTunes search widget in Add Film** — broken for a large chunk of modern titles because the `itunes.apple.com/search` endpoint has a stale/incomplete index. Confirmed failing across US/GB/CA/AU/IE/NZ/DE/FR/IT/ES/SE/NL for Suspiria 2018, Midsommar, Send Help.
2. **Paste Apple TV URL** — works, but only if the URL leads to a page where iTunes has a purchase option (some `umc.cmc.*` pages are metadata-only, linked to streaming services). Users have to find the right URL themselves; `tv.apple.com/search` also returns "isn't available" for the same films its own iOS app finds fine.
3. **Manual entry** — always works, but typing everything by hand for a film that's clearly on Apple TV is the frustration we're trying to eliminate.

The root cause: Apple is slowly migrating iTunes Store → Apple TV, and the public APIs (`itunes.apple.com/search`, tv.apple.com's anonymous search) lag the real catalog. The iOS Apple TV app's `uts/v3/*` endpoints have the current data but require auth we can't reliably spoof server-side.

## Lane A — Chrome extension (user-initiated, per-film)

A toolbar extension runs on `tv.apple.com/*/movie/*`. User finds the film however they want (iOS app share link, Google search, browsing Apple TV); once they're on the film's page, they click the extension button and Film Goblin opens prefilled.

### Design

**Extension (Chromium — Chrome, Edge, Arc, Brave):**

- `manifest.json` (Manifest V3)
- Content script matches `https://tv.apple.com/*/movie/*`
- On each matching page, scrape `"adamId":"<digits>"` from the embedded JSON (same regex used by `resolveAdamIdFromAppleTvUrl` server-side) plus title/year/poster for popup display
- Popup UI: poster thumb + title + "Add to Film Goblin" button
- Click → opens `https://film-goblin.vercel.app/admin/films/new?itunes_id=<digits>` in a new tab
- Icons: 16/32/48/128 px; can reuse the Rubik Wet Paint "FG" wordmark

**Film Goblin side:**

- `/admin/films/new` accepts an `itunes_id` query param. If present and numeric:
  - Server-side calls `adminLookupItunes(String(id))`
  - If hit succeeds: pass the `FilmFormFields` to `AddFilmClient` as `initial` so the form lands prefilled
  - If hit fails: redirect to `/admin/films/new?error=lookup-failed` with a visible notice
- Existing `/admin` layout guard handles the auth case — signed-out users get bounced to `/auth/signin?redirect=/admin/films/new?itunes_id=<id>`, then land on the prefilled form after signing in

**Auth model:** zero tokens. The extension just opens a URL; Film Goblin's session cookie does the rest.

### Pros

- Zero API costs, no quotas, no external service
- One-click from "I'm looking at a film on Apple TV" to "it's in Film Goblin"
- Works for any film the user can find on Apple TV (the user is the search engine, which is more reliable than any available API)
- Dev-mode "load unpacked extension" = no store submission for personal use
- Small surface area — manifest + content script + popup + one query-param handler in the app

### Cons

- **Desktop Chromium only.** Doesn't help on iOS, where the user does a lot of film browsing
- **Brittle to Apple's page JSON structure.** If they rename `adamId` or change the JSON layout, extension breaks silently (popup would just show empty)
- **Distribution friction** if you want it on multiple devices — unlisted Chrome Web Store ($5 one-time dev fee), or load unpacked on each machine

### Estimate

- App: `?itunes_id=<id>` prefill route — ~15 min
- Extension scaffold (manifest + content script + popup + icons + bundler) — ~2-3 hrs
- Polish + README + load-unpacked instructions — ~1 hr
- **Total: ~half a day to a full day**

### Suggested package layout

```
/extension
  package.json            (TS, esbuild or vite)
  manifest.json
  src/
    content-script.ts     # scrape adamId from page
    popup.html
    popup.ts              # renders film info + "Add" button
  icons/
    icon-16.png, icon-32.png, icon-48.png, icon-128.png
  README.md               # how to load unpacked + publish
```

---

## Lane B — Search provider API → Apple TV UMC page → adamId

Admin types a title in Film Goblin's Add Film page. Server queries a proper search API (Brave Search, Google Custom Search, SerpAPI) with a `site:`-restricted query, harvests the matching `tv.apple.com/us/movie/*/umc.cmc.*` URLs, fetches the top candidate's HTML, extracts both the `umc.cmc.*` ID (from the URL) and the `adamId` (from the embedded JSON). Returns candidates with title + year + poster for admin to pick from.

**Important:** use a real search provider API with signed requests. Do NOT scrape Google/DDG HTML — datacenter IPs get blocked (confirmed empirically: both refused during today's investigation).

### Design

**Server action (`adminSearchAppleTv(term: string)`):**

1. Build query: `site:tv.apple.com/us/movie "<term>"` (quotes force phrase match on the title slug).
2. Call search API with key stored in a server-only env var. Options:
   - **Brave Search API** — free tier 2000 queries/month, 1 req/sec; paid tiers beyond. Signup requires credit card. Probably our first pick.
   - **Google Custom Search JSON API** — 100 queries/day free, restricts via a CSE configured for `tv.apple.com/us/movie/*`. More setup, lower daily cap.
   - **SerpAPI or similar wrapper** — per-call pricing, easier onboarding, more expensive at scale.
3. Parse response, extract URLs matching `^https://tv\.apple\.com/us/movie/[a-z0-9-]+/umc\.cmc\.[a-z0-9]+$`.
4. For the top N candidates (say 5), in parallel:
   - Fetch the page HTML server-side
   - Extract `"adamId":"(\d+)"` — same regex `resolveAdamIdFromAppleTvUrl` uses today
   - Extract title/year/poster from embedded metadata for display
   - Store the `umc.cmc.*` from the URL as a candidate-side ID (useful if we ever want to link back to the Apple TV page for admins)
5. Return candidates with `{ adamId, umcId, title, year, posterUrl, appleTvUrl }`. Skip any candidate where adamId extraction failed (those are the metadata-only / streaming-only pages we discovered today).
6. Admin picks one → UI calls the existing `adminCreateFilm` flow, prefilled from the candidate + live iTunes Lookup for the latest price.

**Candidate shape:**

```ts
interface AppleTvCandidate {
  adamId: number;           // iTunes trackId — drives price tracking
  umcId: string;            // e.g. "umc.cmc.6jn7uh12ith6d3hmfw80xczki"
  appleTvUrl: string;       // e.g. "https://tv.apple.com/us/movie/picnic-at-hanging-rock/umc.cmc.6jn7uh..."
  title: string;
  year: number;
  posterUrl: string;
}
```

**UX in Add Film:**

Replace (or add alongside) the broken iTunes search widget. "Search Apple TV" box → type title → hit API → render 3-5 candidate cards → click one → prefilled form.

### Pros

- Works for films iTunes Search can't find (Suspiria, Midsommar, Send Help were the motivating cases) because Google/Brave happily index the Apple TV site
- Server-side automation — admin never leaves Film Goblin
- Graceful degradation: candidates where `adamId` extraction fails get filtered out, so we only surface purchasable-on-iTunes options
- Works for both purchase-on-Apple-TV films AND gracefully excludes the streaming-only `umc.cmc.*` pages (like today's Suspiria 1977 trap)

### Cons

- **Runtime cost.** Brave's paid tier kicks in past 2000 req/mo. At small admin-volume this is a non-issue; at scale it could matter.
- **External dependency.** Google CSE and Brave APIs can rate-limit, change pricing, or have outages. Fallback behavior matters.
- **Search quality depends on Google/Brave's index.** Mostly fine for Apple TV URLs (Apple allows indexing and the site has good crawl coverage), but very-recent releases may not have been indexed yet.
- **Multiple results problem.** Searching `"Ravenous"` on Apple TV might return the 1999 feature + a 2017 Netflix film + a Canadian documentary. The candidate list has to disambiguate visually (poster + year).
- **Env var + signup.** New `BRAVE_SEARCH_API_KEY` or `GOOGLE_CSE_KEY` + CSE ID, set via `vercel env add`. Non-trivial first-time setup for Brave (credit card), simpler for Google CSE (just an API key + CSE config at programmablesearchengine.google.com).

### Estimate

- Search provider signup + env var — 30 min
- `adminSearchAppleTv` server action + candidate fetch pipeline — ~3-4 hrs
- UI component (replace the iTunes search widget in `AddFilmClient`) — ~1 hr
- Error handling + fallback when provider is down — ~30 min
- **Total: ~half day to a full day**

### Config hygiene

- Store provider keys with `--sensitive` (default) — they shouldn't be in `vercel env pull` output. These don't need to be readable after setting.
- Add a 1-line comment in `CLAUDE.md` → Gotchas: which search provider we picked, where the key lives, how to rotate.

---

## Lane C — Apple EPF (Enterprise Partner Feed)

`https://performance-partners.apple.com/epf` — Apple's affiliate program gives partners access to bulk catalog dumps (tab-separated files), including a "Video" feed with the entire Apple TV movies+TV catalog.

### What it contains (relevant bits)

- `media.tbz` / `video.tbz` archives — TSV dumps of every Apple TV film
- Fields per film: trackId, title, artist (director), release date, runtime, genre, description, artwork URLs, price snapshot, ratings, availability by country
- Updated **weekly** for the video feed (music feeds are daily)
- Covers every film that's ever been on the Apple TV storefront, not just what iTunes Search happens to surface

### What it solves

- Fills the iTunes Search gap completely: build a local full-text index of the `video` feed, admin searches it, picks a film, Film Goblin then does a fresh iTunes Lookup by trackId to get live price + upserts into `films`
- Gives us a way to browse the Apple TV catalog without needing a user to find films manually first
- Surfaces films the iOS Apple TV app knows about but web search doesn't (Suspiria 2018, Midsommar, Send Help)

### What it doesn't solve

- Live prices — EPF prices are snapshot-at-download-time; for accurate tracking we still use iTunes Lookup (which the worker already does)
- Streaming availability — "where can I watch this right now for free" isn't in EPF
- Real-time updates — weekly feed cadence means new releases lag by days

### Constraints

- **Requires Apple affiliate approval.** Application at `performance-partners.apple.com` — free, but approval is not automatic. Apple reviews each application; they're looking for legitimate affiliate partners (sites that drive purchase traffic with proper `at=` / `ct=` affiliate tokens). Not everyone gets in. Approval time: days to weeks.
- **Terms of service.** Read carefully. EPF is licensed for affiliate use — using it purely to populate your own product DB may or may not fit. If Film Goblin adds proper affiliate tagging to its "Buy on Apple TV" links (which it should anyway — affiliate revenue on cheap-horror recommendations), the use-case fits squarely.
- **Size + infrastructure.** The full EPF is >100 GB. The `video` feed alone is probably ~500 MB to 2 GB compressed. Download / parse / ingest infra needed — it's a real pipeline, not a one-liner. Weekly cron that pulls the new archive, diffs against the last snapshot, upserts a `apple_catalog_films` table.
- **Odd file format.** EPF TSVs use `\x02` as field separator and `\x01` as end-of-record (not standard TSV). Apple publishes a parser spec.
- **Storage.** Supabase Postgres has room but ingesting ~100k-200k movies as a searchable table is non-trivial — needs full-text indexes.

### Architecture if we went this route

- New package `epf-importer/` alongside worker/db/notifier
- `epf-importer/src/download.ts` — fetches the latest video feed via Apple's feed-file FTP/HTTPS endpoint (auth'd with partner credentials)
- `epf-importer/src/parse.ts` — handles Apple's custom separators, streams rows to avoid loading the whole file in memory
- `epf-importer/src/upsert.ts` — bulk inserts/updates into `apple_catalog_films` (a separate table from the user-curated `films`)
- Weekly Vercel Cron route triggers the import (or run it as a CLI from local for bootstrap)
- `/admin/films/new` gets a fourth entry path: "Search Apple TV catalog" that queries the local `apple_catalog_films` table
- On pick, behavior mirrors iTunes search today: prefill FilmForm with the candidate's fields + run an iTunes Lookup to get live price

### Estimate

- Apple affiliate application + wait — 0 dev time, calendar time unknown
- Download + parse pipeline — 2-3 days
- Schema + ingest + FTS index — 1-2 days
- Admin search widget — 0.5 day
- End-to-end test with a real feed download — 0.5 day
- **Total: ~5-6 dev days once approved**

### Pros

- Solves the search problem at the source
- No runtime dependency on iTunes Search (which is broken anyway)
- Same data the iOS Apple TV app has (roughly)
- Sets up affiliate revenue path if we're not already tagging "Buy on Apple TV" links

### Cons

- Approval gate we don't control
- Non-trivial infrastructure (download + parse + ingest pipeline, weekly refresh cron, FTS indexes, storage cost)
- EPF is a bigger lift than any single feature we've built — real sub-project, not an afternoon

---

## How A, B, C compose

Not substitutes — three slices of the same problem:

- **Extension (A)** = "I'm on the Apple TV page for a film right now, put it in Film Goblin." Per-film, user-initiated, zero catalog coverage in Film Goblin itself. Zero runtime cost.
- **Search API (B)** = "I type a title in Film Goblin, it finds the Apple TV page for me." Per-film, server-initiated, relies on Google/Brave index. Small runtime cost (free tier generally covers admin-volume use).
- **EPF (C)** = "Film Goblin itself knows every film on Apple TV, searchable locally." Whole-catalog, no runtime API dependency, weekly refresh cadence. Large one-time build cost + ongoing storage.

Having all three would be overkill — they overlap. Realistic combinations:

- **A + B:** ship quickly. Extension handles "I'm already on the page." Search API handles "I know the title, do the hunting for me." Covers 95% of admin workflow with no approval gates. Total build time ~1 dev day.
- **A + C:** clean but EPF has an unknown approval lead time and ~5-6 dev days of work. Extension covers admin urgency while waiting.
- **B + C:** C eventually replaces B (local catalog is always better than a live search API). If EPF is guaranteed to land, B is throwaway work.
- **All three:** layered fallback — EPF search by default, Brave when EPF is stale, extension when user is already browsing. Long-term ideal but way over-engineered for v1.

### Short-term plan

- **Build A tomorrow.** Half a day, big UX win, no external dependencies.
- **Build B immediately after (same day or next).** Half-day more, unblocks the "type a title" flow. Brave API is the recommended provider.
- **Apply for EPF now (2-minute form).** Calendar time is running whether we wait or not. If approved within a week, fold it in as sub-project 2 and C supersedes B. If approval is slow or denied, A + B is our steady state.
- **Defer TMDB entirely for now.** The previously-raised "broader catalog with films not on Apple TV" use case is a separate product question; revisit only after A and B ship and we see what admin workflow actually misses.

---

## Tomorrow's decision points

1. Build Lane A (Chrome extension) as specced above? (Yes unless something better surfaces.)
2. Build Lane B (search provider API) immediately after? Which provider — Brave, Google CSE, or SerpAPI?
3. Apply for EPF today to start the approval clock?
4. Where does the extension package live — monorepo (`/extension`) or separate repo?
5. Chrome Web Store submission now, or load-unpacked-only for the first few weeks?
6. Do we tag "Buy on Apple TV" links with affiliate params (`at=<token>&ct=film-goblin`) while we're at it? EPF approval prefers to see active affiliate usage, and Brave/Google CSE signup is agnostic to it.
