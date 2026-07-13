# Film Detail UI Refresh — Design

**Date:** 2026-07-12
**Status:** Approved
**Sub-project:** Bring `/film/[id]` into the editorial visual system already used by Discover and the collection pages without changing film data or actions.

## Problem

The film detail page still uses the earlier composition: a separate cream title band, a large dark poster-and-copy block, and several mostly inline-styled sections. It now feels disconnected from the textured mastheads, editorial cards, ledgers, and mobile hierarchy used by Discover, Hoard, Grimoire, and Diary.

The page is a conversion surface: members save, log, own, recommend, plan, share, buy, and inspect a film here. The redesign must improve hierarchy without changing those behaviors or the queries that support them.

## Decision summary

| Decision | Choice |
|---|---|
| Page shell | A dedicated `film-detail-page` shell with a textured dark cinematic hero |
| Hero composition | Poster and identity/action copy share one editorial stage; title moves into the hero |
| Action hierarchy | Existing action components remain intact inside a bordered ritual panel |
| Supporting information | Synopsis/tags, cast/streaming, verdict/watchers, price history, and reviews become clearly separated editorial rooms |
| Responsive model | Existing zine-CSS system with the single 720px mobile breakpoint |
| Data and behavior | Preserve all queries, server/client boundaries, links, modals, and action props |

## 1. Cinematic hero

The page begins with one dark, textured hero rather than a cream masthead followed by a second hero. The poster remains prominent but is visually integrated with the film title and metadata. Genre is the kicker; title, year, director, runtime, and advisory form the identity block. The existing price sticker remains in the text column and never overlays the poster.

The synopsis and tag taxonomy remain near the film identity. The existing read-more behavior is unchanged.

## 2. Action ritual

Every existing action remains available:

- Watchlist, Grimoire, and watched controls for signed-in members
- Recommend and Plan a Watch for signed-in members
- Share for everyone
- Showtimes when present
- Buy on Apple TV when present
- Trailer when present

The actions sit inside an editorial panel with a short heading so they read as the next decision, not an undifferentiated button wrap. No action is renamed or rewired in this refresh.

## 3. Supporting rooms

- Cast and streaming availability share a responsive information grid beneath the hero.
- Coven verdict and watcher presence retain conditional rendering and become ledger-like panels.
- The 180-day price history stays on the cream contrast band, with the existing `PriceStatBlock` and `FilmPriceLedger` untouched.
- Published reviews render as editorial clippings. Each review body appears exactly once.

Empty sections remain hidden. Signed-out users retain the signup CTA and never see member-only actions or empty watcher space.

## 4. Responsive behavior

Desktop uses an asymmetric poster/copy grid. At 720px and below:

- the hero becomes one column;
- title and identity remain before the poster in reading order;
- the poster is constrained to the viewport and centered;
- the action panel and all action controls fit without horizontal overflow;
- supporting grids collapse to one column;
- bottom safe-area space remains available for the fixed PWA navigation.

No additional primary breakpoint is introduced.

## 5. Testing and evidence

- A source/CSS contract test locks the page shell, hero, action panel, information rooms, cream price room, review cards, stylesheet import, and 720px responsive rule.
- The contract also prevents duplicate review-body rendering.
- Run the full app test suite, typecheck, and production build.
- Render a populated film at desktop and 390px, checking section hierarchy, action visibility, and `scrollWidth === clientWidth`.

## Out of scope

- New film data, recommendations, reviews, or related-film queries
- Changes to action semantics, permissions, modals, or analytics
- Price-history redesign or storefront behavior changes
- Next in the Pit activation contracts; that remains the subsequent project
- Schema, migration, or environment changes
