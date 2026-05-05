// Idealista property scraper.
// ToS: Idealista is the most aggressive at blocking scrapers — they may
// 403 us periodically. We accept that gracefully (empty array) and let
// Imovirtual carry the load when Idealista is unfriendly. One request
// per concelho per 5-day cron.

import { parsePropertyListings, type ParsedPropertyListing } from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";
import { idealistaSearchUrl } from "./target-urls";
import type { PropertyScrapeQuery } from "./types";

export async function scrapeIdealista(
  query: PropertyScrapeQuery,
): Promise<ParsedPropertyListing[]> {
  const url = idealistaSearchUrl(query);
  const html = await fetchHtml(url);
  if (!html) return [];
  return parsePropertyListings({ html, source: "idealista" });
}
