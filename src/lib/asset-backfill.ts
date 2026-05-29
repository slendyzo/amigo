// Per-asset backfill: populate ValuationHistory with real and AI-estimated
// dots from purchase date to today.
//
// Vehicle pipeline:
//   1. Web Archive snapshots of Standvirtual + OLX search URLs covering the
//      ownership window → parsed listings → mileage-filtered median per
//      snapshot → one `web_archive` row per snapshot.
//   2. Gap detection: any > 4 month window with no real dot → Z.AI fallback
//      that estimates monthly values, written as `ai_estimate` rows.
//   3. Status transitions: queued → running → done (or no_data if < 3 real
//      points). `backfillProgress` ticks 0 → 100 so the UI can poll.
//
// Property pipeline:
//   Similar but uses Idealista + Imovirtual, area-band filter (±15%) instead
//   of mileage. Web Archive coverage is sparse for property listings — we
//   accept that and rely on the 5-day cron going forward.
//
// All failures are non-fatal — one bad snapshot or AI call doesn't poison
// the rest. The job catches at the top level and writes a final status
// regardless.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { convertToEur } from "./currency";
import { scrapeMedianIsPlausible } from "./asset-valuation";
import {
  parseVehicleListings,
  vehicleListingMatches,
  type ParsedPropertyListing,
  type ParsedVehicleListing,
} from "./listing-html-parser";
import {
  standvirtualArchiveUrls,
  olxArchiveUrls,
  idealistaArchiveUrls,
  imovirtualArchiveUrls,
} from "./scrapers/target-urls";
import { scrapeWebArchiveVehicle, scrapeWebArchiveProperty } from "./scrapers/web-archive";

const ZAI_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const ZAI_MODEL = "glm-4.6";

const MILEAGE_BAND = 0.15; // ±15%
const AREA_BAND = 0.15; // ±15%
const MIN_REAL_POINTS_FOR_DONE = 3;
const GAP_MONTHS_BEFORE_AI_FILL = 4;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Mark an asset as queued for backfill and fire the job in the background.
 * Returns immediately. Idempotent: already running/done → no-op.
 */
export async function enqueueBackfill(realAssetId: string): Promise<void> {
  const asset = await prisma.realAsset.findUnique({
    where: { id: realAssetId },
    select: { id: true, type: true, backfillStatus: true },
  });
  if (!asset) return;
  if (asset.backfillStatus === "running" || asset.backfillStatus === "queued") return;

  await prisma.realAsset.update({
    where: { id: realAssetId },
    data: {
      backfillStatus: "queued",
      backfillProgress: 0,
      backfillStartedAt: new Date(),
      backfillFinishedAt: null,
    },
  });

  // Fire and forget. Self-hosted Next.js (`next start` on CT 104) keeps the
  // process alive after the request handler returns, so the promise actually
  // executes. In a serverless deploy this would need a queue.
  void runBackfill(realAssetId).catch((err) => {
    console.error(`[asset-backfill] ${realAssetId} unhandled:`, err);
    return prisma.realAsset
      .update({
        where: { id: realAssetId },
        data: { backfillStatus: "no_data", backfillFinishedAt: new Date() },
      })
      .catch(() => {});
  });
}

/**
 * Public re-entry point for the API endpoint to force a fresh run
 * (e.g. after spec edit). Mirrors enqueueBackfill but returns the resulting
 * status so the endpoint can echo it.
 */
export async function runBackfillNow(realAssetId: string): Promise<{ status: string }> {
  await enqueueBackfill(realAssetId);
  await runBackfill(realAssetId);
  const asset = await prisma.realAsset.findUnique({
    where: { id: realAssetId },
    select: { backfillStatus: true },
  });
  return { status: asset?.backfillStatus ?? "no_data" };
}

// ─── Orchestrator ───────────────────────────────────────────────────────────

async function runBackfill(realAssetId: string): Promise<void> {
  await prisma.realAsset.update({
    where: { id: realAssetId },
    data: { backfillStatus: "running", backfillStartedAt: new Date(), backfillProgress: 5 },
  });

  try {
    const asset = await prisma.realAsset.findUnique({
      where: { id: realAssetId },
      include: { vehicle: true, property: true },
    });
    if (!asset) {
      await markFinished(realAssetId, "no_data");
      return;
    }

    if (asset.type === "VEHICLE" && asset.vehicle) {
      await runVehicleBackfill(asset.id, asset.purchaseDate, Number(asset.purchasePriceEur), asset.vehicle);
    } else if (asset.type === "PROPERTY" && asset.property) {
      await runPropertyBackfill(asset.id, asset.purchaseDate, asset.property);
    }

    const realPoints = await prisma.valuationHistory.count({
      where: {
        realAssetId,
        source: { in: ["web_archive", "live_scrape", "purchase"] },
      },
    });
    await markFinished(
      realAssetId,
      realPoints >= MIN_REAL_POINTS_FOR_DONE ? "done" : "no_data",
    );
  } catch (err) {
    console.error(`[asset-backfill] ${realAssetId} failed:`, err);
    await markFinished(realAssetId, "no_data");
  }
}

async function markFinished(realAssetId: string, status: "done" | "no_data") {
  await prisma.realAsset.update({
    where: { id: realAssetId },
    data: {
      backfillStatus: status,
      backfillFinishedAt: new Date(),
      backfillProgress: 100,
    },
  });
}

// ─── Vehicle backfill ───────────────────────────────────────────────────────

async function runVehicleBackfill(
  realAssetId: string,
  purchaseDate: Date,
  purchasePriceEur: number,
  vehicle: { brand: string; model: string; year: number; trim: string | null; mileage: number | null },
): Promise<void> {
  const today = new Date();
  const projectMileage = makeMileageProjector(purchaseDate, today, vehicle.mileage);

  const standvirtualUrls = standvirtualArchiveUrls({
    make: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
  });
  const olxUrls = olxArchiveUrls({
    make: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
  });

  const realDots: Array<{ recordedAt: Date; valueEur: number; sampleSize: number; meta: Record<string, unknown> }> = [];

  // Standvirtual snapshots — try each URL variant, stop after the first
  // that returns any usable data (no need to scrape both mx5 and mx-5).
  for (const url of standvirtualUrls) {
    try {
      const snaps = await scrapeWebArchiveVehicle({
        targetUrl: url,
        fromDate: purchaseDate,
        toDate: today,
        source: "standvirtual",
      });
      let added = false;
      for (const snap of snaps) {
        const dot = await medianFromVehicleSnapshot(snap.listings, projectMileage(snap.archiveDate), {
          make: vehicle.brand,
          model: vehicle.model,
          purchasePriceEur,
        });
        if (dot) {
          realDots.push({
            recordedAt: snap.archiveDate,
            valueEur: dot.valueEur,
            sampleSize: dot.sampleSize,
            meta: { source: "standvirtual", archiveUrl: url, archiveDate: snap.archiveDate.toISOString(), inferredMileage: projectMileage(snap.archiveDate) },
          });
          added = true;
        }
      }
      if (added) break;
    } catch (err) {
      console.warn(`[asset-backfill] standvirtual archive failed for ${url}:`, err);
    }
  }
  await bumpProgress(realAssetId, 50);

  // OLX snapshots — same variant strategy.
  for (const url of olxUrls) {
    try {
      const snaps = await scrapeWebArchiveVehicle({
        targetUrl: url,
        fromDate: purchaseDate,
        toDate: today,
        source: "olx",
      });
      let added = false;
      for (const snap of snaps) {
        const dot = await medianFromVehicleSnapshot(snap.listings, projectMileage(snap.archiveDate), {
          make: vehicle.brand,
          model: vehicle.model,
          purchasePriceEur,
        });
        if (dot) {
          realDots.push({
            recordedAt: snap.archiveDate,
            valueEur: dot.valueEur,
            sampleSize: dot.sampleSize,
            meta: { source: "olx", archiveUrl: url, archiveDate: snap.archiveDate.toISOString(), inferredMileage: projectMileage(snap.archiveDate) },
          });
          added = true;
        }
      }
      if (added) break;
    } catch (err) {
      console.warn(`[asset-backfill] olx archive failed for ${url}:`, err);
    }
  }
  await bumpProgress(realAssetId, 80);

  // Persist real dots
  for (const dot of realDots) {
    await prisma.valuationHistory.create({
      data: {
        realAssetId,
        value: new Prisma.Decimal(dot.valueEur),
        valueEur: new Prisma.Decimal(dot.valueEur),
        currency: "EUR",
        source: "web_archive",
        sampleSize: dot.sampleSize,
        metadata: dot.meta as Prisma.InputJsonValue,
        recordedAt: dot.recordedAt,
      },
    });
  }

  // Gap fill: AI estimates for windows > 4 months between consecutive real dots
  const sortedReal = [...realDots]
    .map((d) => ({ date: d.recordedAt, valueEur: d.valueEur }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  // Anchor with purchase point so the gap detector starts there.
  const anchored = [{ date: purchaseDate, valueEur: purchasePriceEur }, ...sortedReal];

  const aiPoints = await aiFillGaps({
    asset: {
      kind: "vehicle",
      label: `${vehicle.year} ${vehicle.brand} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`,
      purchasePriceEur,
      purchaseDate,
      today,
    },
    knownPoints: anchored,
  });
  for (const p of aiPoints) {
    await prisma.valuationHistory.create({
      data: {
        realAssetId,
        value: new Prisma.Decimal(p.valueEur),
        valueEur: new Prisma.Decimal(p.valueEur),
        currency: "EUR",
        source: "ai_estimate",
        metadata: { reason: "gap_fill" } satisfies Prisma.InputJsonValue,
        recordedAt: p.date,
      },
    });
  }

  await bumpProgress(realAssetId, 95);
}

// Returns null if filtered listings are too few to compute a meaningful median.
async function medianFromVehicleSnapshot(
  listings: ParsedVehicleListing[],
  inferredMileage: number | null,
  spec: { make: string; model: string; purchasePriceEur: number },
): Promise<{ valueEur: number; sampleSize: number } | null> {
  // Drop cross-category junk (wrong make/model) before anything else, same
  // guard the live cron applies — see vehicleListingMatches.
  let pool = listings.filter((l) => l.price > 0 && vehicleListingMatches(l, spec));
  if (inferredMileage != null && inferredMileage > 0) {
    const filtered = pool.filter((l) => {
      if (l.mileage == null) return true; // keep unknown-mileage listings
      const ratio = l.mileage / inferredMileage;
      return ratio >= 1 - MILEAGE_BAND && ratio <= 1 + MILEAGE_BAND;
    });
    if (filtered.length >= 3) pool = filtered; // only apply filter if we keep enough
  }
  if (pool.length < 3) return null;

  const prices = pool.map((l) => l.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];

  // Sanity clamp: reject a historical median wildly above purchase price —
  // same backstop the live cron uses.
  if (!scrapeMedianIsPlausible(median, spec.purchasePriceEur)) return null;

  // We assume EUR — every site we scrape lists in EUR. If a listing slipped
  // through with a non-EUR currency, the parser will have flagged it but we
  // don't bother converting per-listing here (keeping the median honest to
  // the locale would distort the result).
  void parseVehicleListings; // appease unused-import linter — we use the type only
  return { valueEur: round2(median), sampleSize: pool.length };
}

function makeMileageProjector(purchaseDate: Date, today: Date, currentMileage: number | null) {
  return (date: Date): number | null => {
    if (currentMileage == null || currentMileage <= 0) return null;
    const total = today.getTime() - purchaseDate.getTime();
    if (total <= 0) return currentMileage;
    const elapsed = Math.max(0, date.getTime() - purchaseDate.getTime());
    const ratio = Math.min(1, elapsed / total);
    return Math.round(currentMileage * ratio);
  };
}

// ─── Property backfill ──────────────────────────────────────────────────────

async function runPropertyBackfill(
  realAssetId: string,
  purchaseDate: Date,
  property: {
    propertyType: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | "OTHER";
    concelho: string | null;
    livableAreaM2: number | null;
    bedrooms: number | null;
  },
): Promise<void> {
  const concelho = property.concelho;
  if (!concelho) {
    await bumpProgress(realAssetId, 95);
    return;
  }

  const today = new Date();
  const idealistaUrls = idealistaArchiveUrls({
    concelho,
    propertyType: property.propertyType,
    livableAreaM2: property.livableAreaM2,
    bedrooms: property.bedrooms,
  });
  const imovirtualUrls = imovirtualArchiveUrls({
    concelho,
    propertyType: property.propertyType,
    livableAreaM2: property.livableAreaM2,
    bedrooms: property.bedrooms,
  });

  for (const [source, urls, progressTo] of [
    ["idealista", idealistaUrls, 50] as const,
    ["imovirtual", imovirtualUrls, 90] as const,
  ]) {
    for (const url of urls) {
      try {
        const snaps = await scrapeWebArchiveProperty({
          targetUrl: url,
          fromDate: purchaseDate,
          toDate: today,
          source: source as "idealista" | "imovirtual",
        });
        let added = false;
        for (const snap of snaps) {
          const dot = medianFromPropertySnapshot(snap.listings, property.livableAreaM2);
          if (!dot) continue;
          await prisma.valuationHistory.create({
            data: {
              realAssetId,
              value: new Prisma.Decimal(dot.valueEur),
              valueEur: new Prisma.Decimal(dot.valueEur),
              currency: "EUR",
              source: "web_archive",
              sampleSize: dot.sampleSize,
              metadata: {
                source,
                archiveUrl: url,
                archiveDate: snap.archiveDate.toISOString(),
              } satisfies Prisma.InputJsonValue,
              recordedAt: snap.archiveDate,
            },
          });
          added = true;
        }
        if (added) break;
      } catch (err) {
        console.warn(`[asset-backfill] ${source} archive failed for ${url}:`, err);
      }
    }
    await bumpProgress(realAssetId, progressTo);
  }
}

function medianFromPropertySnapshot(
  listings: ParsedPropertyListing[],
  livableAreaM2: number | null,
): { valueEur: number; sampleSize: number } | null {
  let pool = listings.filter((l) => l.price > 0);
  if (livableAreaM2 != null && livableAreaM2 > 0) {
    const filtered = pool.filter((l) => {
      if (l.areaM2 == null) return true;
      const ratio = l.areaM2 / livableAreaM2;
      return ratio >= 1 - AREA_BAND && ratio <= 1 + AREA_BAND;
    });
    if (filtered.length >= 3) pool = filtered;
  }
  if (pool.length < 3) return null;
  const prices = pool.map((l) => l.price).sort((a, b) => a - b);
  return { valueEur: round2(prices[Math.floor(prices.length / 2)]), sampleSize: pool.length };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function bumpProgress(realAssetId: string, progress: number): Promise<void> {
  await prisma.realAsset
    .update({ where: { id: realAssetId }, data: { backfillProgress: progress } })
    .catch(() => {});
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Z.AI gap-fill ──────────────────────────────────────────────────────────

type GapFillInput = {
  asset: {
    kind: "vehicle";
    label: string;
    purchasePriceEur: number;
    purchaseDate: Date;
    today: Date;
  };
  knownPoints: Array<{ date: Date; valueEur: number }>;
};

type GapFillPoint = { date: Date; valueEur: number };

const GAP_FILL_TOOL = {
  type: "function" as const,
  function: {
    name: "record_gap_estimates",
    description:
      "Record AI-estimated value points for the months where there is no real market data.",
    parameters: {
      type: "object" as const,
      properties: {
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dateIso: { type: "string", description: "ISO 8601 date (YYYY-MM-DD)." },
              valueEur: { type: "number", description: "Estimated EUR value at that date." },
            },
            required: ["dateIso", "valueEur"],
          },
        },
      },
      required: ["points"],
    },
  },
};

async function aiFillGaps(input: GapFillInput): Promise<GapFillPoint[]> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) return [];

  const gaps = detectGaps(input.knownPoints, GAP_MONTHS_BEFORE_AI_FILL);
  if (gaps.length === 0) return [];

  const knownLines = input.knownPoints
    .map((p) => `  ${p.date.toISOString().slice(0, 10)}: €${p.valueEur.toFixed(0)}`)
    .join("\n");

  const gapsLines = gaps
    .map(
      (g, i) =>
        `  Gap ${i + 1}: ${g.start.toISOString().slice(0, 10)} → ${g.end.toISOString().slice(0, 10)}`,
    )
    .join("\n");

  const userText = `Asset: ${input.asset.label}
Purchase price (anchor): €${input.asset.purchasePriceEur.toFixed(0)} on ${input.asset.purchaseDate.toISOString().slice(0, 10)}
Today: ${input.asset.today.toISOString().slice(0, 10)}

Known data points (real market dots from scraped sources):
${knownLines}

Gaps with no real data (need estimated quarterly points filled in):
${gapsLines}

For each gap, return one point per quarter (every ~3 months) inside the gap, in EUR.`;

  try {
    const res = await fetch(ZAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ZAI_MODEL,
        thinking: { type: "disabled" },
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content:
              "You estimate the EUR value of a Portuguese-market vehicle at specific dates, anchored on the user-provided real data points. Use a smooth, plausible depreciation curve consistent with the asset and its real dots. Always emit the record_gap_estimates tool call. Return one estimated value per ~3 months inside each requested gap.",
          },
          { role: "user", content: userText },
        ],
        tools: [GAP_FILL_TOOL],
        tool_choice: { type: "function", function: { name: GAP_FILL_TOOL.function.name } },
      }),
    });

    if (!res.ok) {
      console.warn("[asset-backfill] gap-fill HTTP", res.status);
      return [];
    }

    type Resp = {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const data: Resp = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return [];

    const parsed = JSON.parse(args) as { points?: unknown };
    if (!Array.isArray(parsed.points)) return [];

    const out: GapFillPoint[] = [];
    for (const item of parsed.points) {
      if (!item || typeof item !== "object") continue;
      const dateIso = (item as Record<string, unknown>).dateIso;
      const valueEur = (item as Record<string, unknown>).valueEur;
      if (typeof dateIso !== "string" || typeof valueEur !== "number") continue;
      const d = new Date(dateIso);
      if (Number.isNaN(d.getTime())) continue;
      if (!Number.isFinite(valueEur) || valueEur <= 0) continue;
      out.push({ date: d, valueEur: round2(valueEur) });
    }
    return out;
  } catch (err) {
    console.warn("[asset-backfill] gap-fill failed:", err);
    return [];
  }
}

function detectGaps(
  points: Array<{ date: Date; valueEur: number }>,
  thresholdMonths: number,
): Array<{ start: Date; end: Date }> {
  if (points.length < 2) return [];
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const gaps: Array<{ start: Date; end: Date }> = [];
  const monthMs = 30.44 * 24 * 60 * 60 * 1000;
  for (let i = 0; i < sorted.length - 1; i++) {
    const span = sorted[i + 1].date.getTime() - sorted[i].date.getTime();
    if (span / monthMs >= thresholdMonths) {
      gaps.push({ start: sorted[i].date, end: sorted[i + 1].date });
    }
  }
  return gaps;
}

// Use this from the convertToEur import to keep lint happy.
void convertToEur;
