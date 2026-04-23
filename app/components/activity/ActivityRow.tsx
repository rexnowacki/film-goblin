import type { EnrichedActivity } from "@/lib/queries/activity";
import ActivityRecommendationSent from "./ActivityRecommendationSent";
import ActivityReviewPublished from "./ActivityReviewPublished";
import ActivityWatchlistAdded from "./ActivityWatchlistAdded";
import ActivityListCreated from "./ActivityListCreated";
import ActivityListFilmAdded from "./ActivityListFilmAdded";
import ActivityCovenJoined from "./ActivityCovenJoined";

export default function ActivityRow({ item }: { item: EnrichedActivity }) {
  switch (item.kind) {
    case "recommendation_sent": return <ActivityRecommendationSent item={item} />;
    case "review_published": return <ActivityReviewPublished item={item} />;
    case "watchlist_added": return <ActivityWatchlistAdded item={item} />;
    case "list_created": return <ActivityListCreated item={item} />;
    case "list_film_added": return <ActivityListFilmAdded item={item} />;
    case "coven_joined": return <ActivityCovenJoined item={item} />;
  }
}
