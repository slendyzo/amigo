// Standvirtual vehicle scraper. Single request, polite UA, parses via Z.AI.
// ToS: Standvirtual robots.txt allows /carros/* without crawl-delay; this
// helper hits it once per spec per 5-day cron, well below any reasonable
// rate threshold.

import { parseVehicleListings, type ParsedVehicleListing } from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";
import { standvirtualSearchUrl } from "./target-urls";
import type { VehicleScrapeQuery } from "./types";

export async function scrapeStandvirtual(
  query: VehicleScrapeQuery,
): Promise<ParsedVehicleListing[]> {
  const url = standvirtualSearchUrl(query);
  const html = await fetchHtml(url);
  if (!html) return [];
  return parseVehicleListings({ html, source: "standvirtual" });
}
