---
title: Performance pass for film and feed pages
owner: unclaimed
priority: high
created: 2026-05-11
---

## Goal

Reduce unnecessary third-party and media loading on high-traffic pages,
especially `/film/[id]`, `/home`, and `/films`.

## Acceptance

- [x] Trailer embeds do not load YouTube player scripts until the user plays them.
- [x] Poster/image `sizes` values match rendered layout more closely.
- [x] Raw `<img>` usage is reviewed and converted to `next/image` where it affects
  public surfaces.
- [x] Google font loading is moved from a runtime stylesheet link to `next/font`
  self-hosted assets.
- [x] Non-critical `next/font` faces avoid route-wide preloading; production now
  sends four font preloads instead of twelve.
- [x] Settings form receives initial profile/auth state from the server instead
  of doing a duplicate client-side profile fetch before rendering.
- [x] `/home` recommendation/sidebar wrappers are trimmed: `GoblinRecommends`
  is mostly server-rendered, whisper interaction is isolated, and
  `FollowedActivityFeed` no longer creates a client boundary just to group rows.
- [x] `next build` remains clean.

## Notes

First low-risk win: replace direct YouTube iframe with a lite `srcDoc` iframe.
Second low-risk win: give `FilmPoster` responsive `sizes` defaults so Next serves
more appropriate poster image widths across mobile grids and desktop layouts.
Raw public `<img>` usage remains in a few places where sources are arbitrary
external URLs; converting those needs either known host allowlisting or a proxy.

Build caveat: `next build` passes, but still emits the pre-existing
Sentry/OpenTelemetry dynamic require warning from
`app/api/cron/check-itunes-availability/route.ts`.
