import { NextResponse } from "next/server";

import { getSearchSuggestions } from "@/lib/market-data";

const SEARCH_CACHE_MS = 60_000;
const MAX_SEARCH_CACHE_ENTRIES = 100;
const searchCache = new Map<string, { expiresAt: number; suggestions: Awaited<ReturnType<typeof getSearchSuggestions>> }>();

function setSearchCache(key: string, value: { expiresAt: number; suggestions: Awaited<ReturnType<typeof getSearchSuggestions>> }) {
  if (searchCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }

  searchCache.set(key, value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();
  const cacheKey = query.toUpperCase();
  const cached = searchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ suggestions: cached.suggestions, cache: "memory", cacheTtlMs: cached.expiresAt - Date.now() });
  }

  const suggestions = await getSearchSuggestions(query);
  setSearchCache(cacheKey, { expiresAt: Date.now() + SEARCH_CACHE_MS, suggestions });

  return NextResponse.json({ suggestions, cache: "fresh", cacheTtlMs: SEARCH_CACHE_MS });
}
