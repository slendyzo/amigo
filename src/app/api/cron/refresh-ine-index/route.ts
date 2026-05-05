import { NextResponse } from "next/server";
import {
  fetchLatestIneHousingIndex,
  upsertIneRows,
  type IneIndexRow,
} from "@/lib/property-valuation-index";

// Quarterly INE housing-index ingest. Hit by the daily cron — INE only updates
// quarterly so most days this is a fast no-op (same rows upserted, no change).
//
// Auth: x-cron-secret header matching CRON_SECRET, identical to refresh-valuations.
//
// Manual seed mode: POST a JSON body of the shape
//   { "rows": [{ "concelhoName": "Lisboa", "year": 2025, "quarter": 1, "indexValue": 3850 }, ...] }
// to upsert without going to INE. Useful if the upstream URL breaks or for
// local development.

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

type ManualBody = { rows?: IneIndexRow[] };

function isIneIndexRow(value: unknown): value is IneIndexRow {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.concelhoName === "string" &&
    Number.isFinite(r.year) &&
    Number.isFinite(r.quarter) &&
    Number.isFinite(r.indexValue)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Manual seed branch: skip the live fetch if a JSON body of rows was sent.
  let body: ManualBody | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    body = (await request.json().catch(() => null)) as ManualBody | null;
  }

  if (body?.rows && Array.isArray(body.rows)) {
    const validRows = body.rows.filter(isIneIndexRow);
    const result = await upsertIneRows(validRows, "manual");
    return NextResponse.json({
      ok: true,
      mode: "manual",
      received: body.rows.length,
      written: result.written,
      skipped: result.skipped + (body.rows.length - validRows.length),
      tookMs: Date.now() - startedAt,
    });
  }

  try {
    const fetched = await fetchLatestIneHousingIndex();
    const result = await upsertIneRows(fetched.rows, "INE");
    return NextResponse.json({
      ok: true,
      mode: "ine",
      fetched: fetched.rows.length,
      written: result.written,
      skipped: result.skipped,
      warnings: fetched.warnings,
      tookMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/refresh-ine-index] live fetch failed:", err);
    return NextResponse.json(
      {
        ok: false,
        mode: "ine",
        error: err instanceof Error ? err.message : "Unknown error",
        tookMs: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }
}
