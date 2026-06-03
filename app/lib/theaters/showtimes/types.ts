export interface ScrapedShowtime {
  sid: string;
  title: string;
  rawDate: string;
  screenLabel: string;
  filmUrl: string;
}

export interface ResolvedShowtime extends ScrapedShowtime {
  startsAt: string;
  formatLabel: string | null;
}

export interface ShowtimesRunSummary {
  scraped: number;
  inWindow: number;
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  matched: number;
}
