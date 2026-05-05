// Web Archive (archive.org) scraper for historical backfill.
//
// Given a search-URL template + date range, returns ~12 evenly-spaced
// snapshots of that URL's archived state, each with structured listings.
// Used by the per-asset backfill job to populate ValuationHistory with
// real (not estimated) data points covering the ownership window.
//
// Algorithm:
//   1. Query the CDX API for snapshots of the URL between fromDate..toDate
//      that returned 200 OK and have content-type text/html.
//   2. Sample down to ~12 evenly-spaced snapshots so we don't blow AI budget
//      on dense weeks while having gaps in lean ones.
//   3. Fetch each archived page from /web/{timestamp}/{url}.
//   4. Parse via listing-html-parser, tag each result with its archiveDate.
//
// Failures are non-fatal: a missing/redirected/timed-out snapshot is dropped
// and we keep going. If the CDX API itself is down or returns nothing, we
// return an empty array and the backfill caller logs "no data" gracefully.

import {
  parseVehicleListings,
  parsePropertyListings,
  type ListingSource,
  type ParsedVehicleListing,
  type ParsedPropertyListing,
} from "../listing-html-parser";
import { fetchHtml } from "./fetch-html";

const CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx";
const ARCHIVE_PREFIX = "https://web.archive.org/web";
const TARGET_SNAPSHOTS = 12;
const CDX_TIMEOUT_MS = 20_000;

export type WebArchiveSnapshot<T> = {
  archiveDate: Date;
  archivedUrl: string;
  listings: T[];
};

export type WebArchiveQuery = {
  /** The original (unarchived) URL to look up. */
  targetUrl: string;
  /** Earliest snapshot to consider (inclusive). */
  fromDate: Date;
  /** Latest snapshot to consider (inclusive). */
  toDate: Date;
  /** The original site, passed through to the parser for logging. */
  source: ListingSource;
};

export async function scrapeWebArchiveVehicle(
  q: WebArchiveQuery,
): Promise<WebArchiveSnapshot<ParsedVehicleListing>[]> {
  const snapshots = await fetchSnapshotList(q);
  const out: WebArchiveSnapshot<ParsedVehicleListing>[] = [];
  for (const snap of snapshots) {
    const html = await fetchHtml(snap.archivedUrl);
    if (!html) continue;
    const listings = await parseVehicleListings({ html, source: q.source });
    out.push({ archiveDate: snap.archiveDate, archivedUrl: snap.archivedUrl, listings });
  }
  return out;
}

export async function scrapeWebArchiveProperty(
  q: WebArchiveQuery,
): Promise<WebArchiveSnapshot<ParsedPropertyListing>[]> {
  const snapshots = await fetchSnapshotList(q);
  const out: WebArchiveSnapshot<ParsedPropertyListing>[] = [];
  for (const snap of snapshots) {
    const html = await fetchHtml(snap.archivedUrl);
    if (!html) continue;
    const listings = await parsePropertyListings({ html, source: q.source });
    out.push({ archiveDate: snap.archiveDate, archivedUrl: snap.archivedUrl, listings });
  }
  return out;
}

// ─── CDX query + sampling ───────────────────────────────────────────────────

type CdxRow = {
  timestamp: string; // YYYYMMDDhhmmss
  archiveDate: Date;
  archivedUrl: string;
};

async function fetchSnapshotList(q: WebArchiveQuery): Promise<CdxRow[]> {
  const params = new URLSearchParams({
    url: q.targetUrl,
    output: "json",
    fl: "timestamp,statuscode,mimetype,original",
    filter: "statuscode:200",
    from: yyyymmdd(q.fromDate),
    to: yyyymmdd(q.toDate),
    collapse: "timestamp:8", // collapse to one snapshot per day
  });

  const cdxUrl = `${CDX_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDX_TIMEOUT_MS);

  try {
    const res = await fetch(cdxUrl, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[web-archive] CDX ${res.status} ${cdxUrl}`);
      return [];
    }
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows) || rows.length <= 1) return [];

    // First row is header. Drop it.
    const dataRows = rows.slice(1) as Array<unknown[]>;
    const all: CdxRow[] = [];
    for (const r of dataRows) {
      if (!Array.isArray(r) || r.length < 4) continue;
      const ts = String(r[0] ?? "");
      const mime = String(r[2] ?? "");
      const original = String(r[3] ?? "");
      if (!/^\d{14}$/.test(ts)) continue;
      if (!mime.startsWith("text/html")) continue;
      all.push({
        timestamp: ts,
        archiveDate: parseCdxTimestamp(ts),
        archivedUrl: `${ARCHIVE_PREFIX}/${ts}/${original}`,
      });
    }

    return sampleEvenly(all, TARGET_SNAPSHOTS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[web-archive] CDX fetch failed: ${msg}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function sampleEvenly<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr;
  const step = (arr.length - 1) / (target - 1);
  const out: T[] = [];
  for (let i = 0; i < target; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseCdxTimestamp(ts: string): Date {
  // YYYYMMDDhhmmss → Date in UTC
  const y = Number(ts.slice(0, 4));
  const mo = Number(ts.slice(4, 6)) - 1;
  const d = Number(ts.slice(6, 8));
  const h = Number(ts.slice(8, 10));
  const mi = Number(ts.slice(10, 12));
  const s = Number(ts.slice(12, 14));
  return new Date(Date.UTC(y, mo, d, h, mi, s));
}
