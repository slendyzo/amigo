// Common types shared by every scraper (live and Web Archive).
//
// Note on ToS posture: every site we scrape allows non-commercial,
// low-rate scraping for personal use under their robots.txt + general
// terms. We hit each site at most once per spec per 5-day cron, with
// a randomized delay and realistic UA. If any site explicitly blocks
// us we degrade gracefully (empty array — caller falls through to
// AI estimate or "limited market data" empty state).

export type VehicleScrapeQuery = {
  make: string;
  model: string;
  year: number;
  trim?: string | null;
  /** Optional km filter — applied at the parsing/median stage, not the URL. */
  mileage?: number | null;
};

export type PropertyScrapeQuery = {
  concelho: string;
  propertyType: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | "OTHER";
  livableAreaM2?: number | null;
  bedrooms?: number | null;
};

export type ScrapeAttempt = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};
