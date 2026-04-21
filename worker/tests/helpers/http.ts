import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { ITunesLookupResponse } from "../../src/types.js";
import { midsommarResult } from "../fixtures/itunes-responses.js";

export function makeLookupHandler(
  response: Partial<ITunesLookupResponse> | (() => Response)
) {
  return http.get("https://itunes.apple.com/lookup", () => {
    if (typeof response === "function") return response();
    return HttpResponse.json({
      resultCount: response.resultCount ?? 1,
      results: response.results ?? [midsommarResult],
    });
  });
}

export function makeServer(...handlers: ReturnType<typeof http.get>[]) {
  return setupServer(...handlers);
}
