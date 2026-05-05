import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { TheaterRunSummary } from "./types";
import { theaterProviders } from "./providers";
import { upsertShowingsForTheater } from "./upsert-showings";
import { matchActiveShowings } from "./match-showings";
import { createTheaterNotifications } from "./create-theater-notifications";

type Client = SupabaseClient<Database>;

export interface RunTheaterAlertsResult extends TheaterRunSummary {
  sources: string[];
}

export async function runTheaterAlerts(client: Client): Promise<RunTheaterAlertsResult> {
  const summary: RunTheaterAlertsResult = {
    sources: [],
    scraped: 0,
    inserted: 0,
    updated: 0,
    staleMarkedInactive: 0,
    matchedAuto: 0,
    needsReview: 0,
    notificationsCreated: 0,
  };
  const allShowingIds: string[] = [];

  for (const provider of theaterProviders) {
    const scraped = await provider.scrapeComingSoon();
    if (scraped.length < 1) {
      throw new Error(`${provider.theaterSlug} returned suspiciously few showings`);
    }
    const upsert = await upsertShowingsForTheater(client, provider.theaterSlug, scraped);
    summary.sources.push(provider.theaterSlug);
    summary.scraped += scraped.length;
    summary.inserted += upsert.inserted;
    summary.updated += upsert.updated;
    summary.staleMarkedInactive += upsert.staleMarkedInactive;
    allShowingIds.push(...upsert.showingIds);
  }

  const matches = await matchActiveShowings(client, allShowingIds);
  summary.matchedAuto += matches.matchedAuto;
  summary.needsReview += matches.needsReview;

  const notifications = await createTheaterNotifications(client, allShowingIds);
  summary.notificationsCreated += notifications.notificationsCreated;

  return summary;
}
