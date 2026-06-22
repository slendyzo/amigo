import { NextResponse } from "next/server";

// SUNSET (2026-06-22). Live-market comparables scraping has been retired.
//
// The pipeline parsed scraped listing HTML into structured prices via GLM
// (Z.ai). With the AI API removed, listing parsing returned [] on every run and
// the cron failed silently while the UI still showed heuristic-only values as if
// they were market-derived. Rather than keep a broken, silently-failing path,
// valuation now relies solely on the heuristic engine (see
// /api/cron/refresh-valuations), which labels values as estimates.
//
// This endpoint is kept as an inert stub so any lingering cron/curl that still
// hits it gets a clear, non-failing response instead of running dead scrapers.
// The crontab entry on CT 104 has been removed.

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    sunset: true,
    message:
      "Live-market comparables scraping is retired. Valuation is heuristic-only via /api/cron/refresh-valuations.",
  });
}
