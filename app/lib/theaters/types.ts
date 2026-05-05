export type DatePrecision = "datetime" | "date" | "label" | "unknown";

export interface ScrapedTheaterShowing {
  title: string;
  sourceUrl: string;
  sourceId?: string;
  theaterSlug: string;

  startsAt?: string;
  startsOn?: string;
  datePrecision: DatePrecision;
  dateLabel?: string;

  runtimeLabel?: string;
  ratingLabel?: string;
  categoryLabels: string[];

  posterUrl?: string;
  description?: string;
  showtimeLabel?: string;

  rawTitle?: string;
  rawDateText?: string;
  rawShowtimeText?: string;
}

export interface TheaterScraperProvider {
  theaterSlug: string;
  sourceName: string;
  sourceUrl: string;
  scrapeComingSoon: () => Promise<ScrapedTheaterShowing[]>;
}

export interface TheaterRunSummary {
  scraped: number;
  inserted: number;
  updated: number;
  staleMarkedInactive: number;
  matchedAuto: number;
  needsReview: number;
  notificationsCreated: number;
}
