// Imovirtual property scraper. PT-friendly, generally allows polite scraping.
// One request per concelho per 5-day cron.

import { parsePropertyListings, type ParsedPropertyListing } from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";
import { imovirtualSearchUrl } from "./target-urls";
import type { PropertyScrapeQuery } from "./types";

export async function scrapeImovirtual(
  query: PropertyScrapeQuery,
): Promise<ParsedPropertyListing[]> {
  const url = imovirtualSearchUrl(query);
  const html = await fetchHtml(url);
  if (!html) return [];
  return parsePropertyListings({ html, source: "imovirtual" });
}
