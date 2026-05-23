"use client";

import { useEffect, useRef, useState } from "react";

interface Options<T> {
  minLength?: number;
  slowDelayMs?: number;
  fastDelayMs?: number;
  search: (query: string) => Promise<T>;
  filter: (cached: T, query: string) => T;
  empty: T;
}

export function useCachedTypeahead<T>(query: string, options: Options<T>): T {
  const {
    minLength = 2,
    slowDelayMs = 180,
    fastDelayMs = 80,
    search,
    filter,
    empty,
  } = options;
  const [results, setResults] = useState<T>(empty);
  const cacheRef = useRef<Map<string, T>>(new Map());

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < minLength) {
      setResults(empty);
      return;
    }

    const exact = cacheRef.current.get(q);
    if (exact) {
      setResults(exact);
      return;
    }

    const cachedPrefix = Array.from(cacheRef.current.keys())
      .filter(k => q.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (cachedPrefix) {
      const cached = cacheRef.current.get(cachedPrefix);
      if (cached) setResults(filter(cached, q));
    }

    let cancelled = false;
    const t = window.setTimeout(async () => {
      const next = await search(q);
      if (cancelled) return;
      cacheRef.current.set(q, next);
      setResults(next);
    }, cachedPrefix ? fastDelayMs : slowDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [empty, fastDelayMs, filter, minLength, query, search, slowDelayMs]);

  return results;
}
