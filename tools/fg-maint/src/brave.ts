import { requireEnv } from "./env.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

export async function searchBrave(query: string, limit: number): Promise<BraveSearchResult[]> {
  const key = requireEnv("BRAVE_SEARCH_API_KEY");
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.max(1, Math.min(limit, 20))));

  const res = await fetch(url, {
    headers: {
      "X-Subscription-Token": key,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Brave search returned HTTP ${res.status}`);

  const body = (await res.json()) as BraveResponse;
  return (body.web?.results ?? [])
    .filter((result) => {
      return Boolean(result.title && result.url);
    })
    .map((result) => ({
      title: result.title ?? "",
      url: result.url ?? "",
      description: result.description ?? "",
    }));
}
