// How a film_requests row maps onto adminCreateFilm when approved.
// Shared by fulfillFilmRequest (server) and AddFilmClient (client).

export function requestCreateOverrides(req: {
  source: string;
  scout_window?: string | null;
  release_date?: string | null;
}): { theatrical_release_date: string | null; summoned: boolean } {
  return {
    theatrical_release_date: req.scout_window === "theatrical" ? (req.release_date ?? null) : null,
    summoned: req.source !== "scout",
  };
}
