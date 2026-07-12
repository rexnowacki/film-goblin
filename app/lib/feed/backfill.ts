export const FEED_DISPLAY_TARGET = 20;

export type BackfillTab = "all" | "coven" | "recs" | "pit";

export function shouldBackfillFeed(args: {
  renderedCount: number;
  done: boolean;
  loading: boolean;
  hasCursor: boolean;
  tab: BackfillTab;
}): boolean {
  return args.tab !== "pit"
    && args.renderedCount < FEED_DISPLAY_TARGET
    && !args.done
    && !args.loading
    && args.hasCursor;
}
