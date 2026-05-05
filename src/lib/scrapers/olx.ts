// OLX (PT) vehicle scraper. Same shape as Standvirtual.
// ToS: OLX allows non-commercial scraping under reasonable rate. We hit
// it once per spec per 5-day cron.

import { parseVehicleListings, type ParsedVehicleListing } from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";
import { olxCarsSearchUrl } from "./target-urls";
import type { VehicleScrapeQuery } from "./types";

export async function scrapeOlx(
  query: VehicleScrapeQuery,
): Promise<ParsedVehicleListing[]> {
  const url = olxCarsSearchUrl(query);
  const html = await fetchHtml(url);
  if (!html) return [];
  return parseVehicleListings({ html, source: "olx" });
}
