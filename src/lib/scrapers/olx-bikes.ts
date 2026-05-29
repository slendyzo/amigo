// OLX (PT) bicycle scraper. Bikes are heuristic-only EXCEPT for this PT market
// feed — buycycle (the pan-EU source) is an auth-walled SPA we can't scrape
// cheaply, so OLX.pt is the live resale source for bicycles (AMIGO-258).
//
// Same shape as the OLX cars scraper: build the search URL, fetch HTML, parse
// listings with the shared LLM parser. The caller applies the make/model
// matcher + sanity clamp before trusting the median.

import { parseVehicleListings, type ParsedVehicleListing } from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";
import { olxBikesSearchUrl } from "./target-urls";
import type { VehicleScrapeQuery } from "./types";

export async function scrapeOlxBikes(
  query: VehicleScrapeQuery,
): Promise<ParsedVehicleListing[]> {
  const url = olxBikesSearchUrl(query);
  const html = await fetchHtml(url);
  if (!html) return [];
  return parseVehicleListings({ html, source: "olx" });
}
