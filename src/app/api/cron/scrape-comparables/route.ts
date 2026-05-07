import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { scrapeStandvirtual } from "@/lib/scrapers/standvirtual";
import { scrapeOlx } from "@/lib/scrapers/olx";
import { scrapeIdealista } from "@/lib/scrapers/idealista";
import { scrapeImovirtual } from "@/lib/scrapers/imovirtual";
import type {
  ParsedPropertyListing,
  ParsedVehicleListing,
} from "@/lib/listing-html-parser";

// Forward-rolling 5-day cron. Scrapes live listings for every active spec,
// caches the snapshot in `spec_market_snapshot`, then writes a per-asset
// median into `ValuationHistory` (source = "live_scrape").
//
// Auth: x-cron-secret header (same pattern as /api/cron/refresh-valuations).
//
// Crontab entry on CT 104 (every 5 days at 04:30 Lisbon):
//   30 4 */5 * * curl -fsS -X POST -H "x-cron-secret: ${CRON_SECRET}" \
//     https://amigo.slendyzo.pt/api/cron/scrape-comparables

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes — Next.js serverless guard (no-op on self-hosted)

const MILEAGE_BAND = 0.15;
const AREA_BAND = 0.15;
const MIN_MEDIAN_SAMPLES = 3;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

function specHashOf(year: number, make: string, model: string, trim: string | null): string {
  return createHash("sha256")
    .update(`${year}|${make}|${model}|${trim ?? ""}`)
    .digest("hex");
}

function median(prices: number[]): number {
  return prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let vehicleSpecsScraped = 0;
  let vehicleSpecsFailed = 0;
  let vehicleAssetsUpdated = 0;
  let propertySpecsScraped = 0;
  let propertySpecsFailed = 0;
  let propertyAssetsUpdated = 0;

  // ─── Vehicle pass ─────────────────────────────────────────────────────────

  const activeVehicles = await prisma.realAsset.findMany({
    where: { status: "ACTIVE", type: "VEHICLE" },
    include: { vehicle: true },
  });

  // Group by spec hash. We scrape once per (year, make, model, trim) and
  // apply the result to every asset that shares that spec.
  type VehicleSpec = {
    specHash: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    assets: typeof activeVehicles;
  };
  const vehicleBuckets = new Map<string, VehicleSpec>();
  for (const asset of activeVehicles) {
    if (!asset.vehicle) continue;
    const v = asset.vehicle;
    const hash = specHashOf(v.year, v.brand, v.model, v.trim);
    const bucket = vehicleBuckets.get(hash) ?? {
      specHash: hash,
      year: v.year,
      make: v.brand,
      model: v.model,
      trim: v.trim,
      assets: [] as typeof activeVehicles,
    };
    bucket.assets.push(asset);
    vehicleBuckets.set(hash, bucket);
  }

  for (const spec of vehicleBuckets.values()) {
    try {
      const [sv, olx] = await Promise.all([
        scrapeStandvirtual({
          make: spec.make,
          model: spec.model,
          year: spec.year,
          trim: spec.trim,
        }).catch(() => [] as ParsedVehicleListing[]),
        scrapeOlx({
          make: spec.make,
          model: spec.model,
          year: spec.year,
          trim: spec.trim,
        }).catch(() => [] as ParsedVehicleListing[]),
      ]);

      const allListings = [...sv, ...olx];
      if (allListings.length === 0) {
        vehicleSpecsFailed++;
        continue;
      }

      // Snapshot the combined pool, tagged with the dominant source for context.
      const dominant = sv.length >= olx.length ? "standvirtual_live" : "olx_live";
      await prisma.specMarketSnapshot.create({
        data: {
          specHash: spec.specHash,
          year: spec.year,
          make: spec.make,
          model: spec.model,
          trim: spec.trim,
          source: dominant,
          listings: allListings as unknown as Prisma.InputJsonValue,
          sampleSize: allListings.length,
        },
      });
      vehicleSpecsScraped++;

      // Per-asset median (mileage-band filtered).
      for (const asset of spec.assets) {
        const mileage = asset.vehicle?.mileage ?? null;
        let pool = allListings.filter((l) => l.price > 0);
        if (mileage != null && mileage > 0) {
          const filtered = pool.filter((l) => {
            if (l.mileage == null) return true;
            const ratio = l.mileage / mileage;
            return ratio >= 1 - MILEAGE_BAND && ratio <= 1 + MILEAGE_BAND;
          });
          if (filtered.length >= MIN_MEDIAN_SAMPLES) pool = filtered;
        }
        if (pool.length < MIN_MEDIAN_SAMPLES) continue;

        const med = median(pool.map((l) => l.price));
        await prisma.$transaction([
          prisma.valuationHistory.create({
            data: {
              realAssetId: asset.id,
              value: new Prisma.Decimal(med),
              valueEur: new Prisma.Decimal(med),
              currency: "EUR",
              source: "live_scrape",
              sampleSize: pool.length,
              metadata: {
                source: dominant,
                inferredMileage: mileage,
              } satisfies Prisma.InputJsonValue,
            },
          }),
          prisma.realAsset.update({
            where: { id: asset.id },
            data: {
              currentValue: new Prisma.Decimal(med),
              currentValueEur: new Prisma.Decimal(med),
              currentValueUpdatedAt: new Date(),
              currentValueSource: "live_scrape",
              // Promote no_data → done. Initial backfill may have come up empty
              // for this spec (e.g. Web Archive coverage gap), but once a live
              // scrape lands, the asset has data — flip the flag so the chart
              // stops showing the empty state.
              backfillStatus: "done",
              backfillProgress: 100,
            },
          }),
        ]);
        vehicleAssetsUpdated++;
      }
    } catch (err) {
      vehicleSpecsFailed++;
      console.error(`[cron/scrape-comparables] vehicle spec failed:`, spec, err);
    }
  }

  // ─── Property pass ────────────────────────────────────────────────────────

  const activeProperties = await prisma.realAsset.findMany({
    where: { status: "ACTIVE", type: "PROPERTY" },
    include: { property: true },
  });

  // Properties group by (concelho, propertyType, livableAreaM2 band, bedrooms band).
  // Bands collapse near-identical properties into one scrape.
  type PropertySpec = {
    key: string;
    concelho: string;
    propertyType: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | "OTHER";
    livableAreaM2: number | null;
    bedrooms: number | null;
    assets: typeof activeProperties;
  };
  const propertyBuckets = new Map<string, PropertySpec>();
  for (const asset of activeProperties) {
    const concelho = asset.property?.concelho;
    if (!concelho) continue;
    const p = asset.property!;
    const areaBand = p.livableAreaM2 != null ? Math.round(p.livableAreaM2 / 25) * 25 : 0;
    const bedBand = p.bedrooms ?? 0;
    const key = `${concelho}|${p.propertyType}|${areaBand}|${bedBand}`;
    const bucket =
      propertyBuckets.get(key) ??
      ({
        key,
        concelho,
        propertyType: p.propertyType,
        livableAreaM2: p.livableAreaM2,
        bedrooms: p.bedrooms,
        assets: [] as typeof activeProperties,
      } satisfies PropertySpec);
    bucket.assets.push(asset);
    propertyBuckets.set(key, bucket);
  }

  for (const spec of propertyBuckets.values()) {
    try {
      const [idl, imv] = await Promise.all([
        scrapeIdealista({
          concelho: spec.concelho,
          propertyType: spec.propertyType,
          livableAreaM2: spec.livableAreaM2,
          bedrooms: spec.bedrooms,
        }).catch(() => [] as ParsedPropertyListing[]),
        scrapeImovirtual({
          concelho: spec.concelho,
          propertyType: spec.propertyType,
          livableAreaM2: spec.livableAreaM2,
          bedrooms: spec.bedrooms,
        }).catch(() => [] as ParsedPropertyListing[]),
      ]);

      const allListings = [...idl, ...imv];
      if (allListings.length === 0) {
        propertySpecsFailed++;
        continue;
      }

      const dominant = idl.length >= imv.length ? "idealista_live" : "imovirtual_live";
      // SpecMarketSnapshot is keyed by (specHash, year, make, model, trim).
      // For properties we reuse it with synthesized values: a sha256 of the
      // concelho/type/bands key, year=0, make=concelho, model=type, trim=null.
      const fakeHash = createHash("sha256").update(`prop|${spec.key}`).digest("hex");
      await prisma.specMarketSnapshot.create({
        data: {
          specHash: fakeHash,
          year: 0,
          make: spec.concelho,
          model: spec.propertyType,
          trim: null,
          source: dominant,
          listings: allListings as unknown as Prisma.InputJsonValue,
          sampleSize: allListings.length,
        },
      });
      propertySpecsScraped++;

      for (const asset of spec.assets) {
        const ownArea = asset.property?.livableAreaM2 ?? null;
        let pool = allListings.filter((l) => l.price > 0);
        if (ownArea != null && ownArea > 0) {
          const filtered = pool.filter((l) => {
            if (l.areaM2 == null) return true;
            const ratio = l.areaM2 / ownArea;
            return ratio >= 1 - AREA_BAND && ratio <= 1 + AREA_BAND;
          });
          if (filtered.length >= MIN_MEDIAN_SAMPLES) pool = filtered;
        }
        if (pool.length < MIN_MEDIAN_SAMPLES) continue;

        const med = median(pool.map((l) => l.price));
        await prisma.$transaction([
          prisma.valuationHistory.create({
            data: {
              realAssetId: asset.id,
              value: new Prisma.Decimal(med),
              valueEur: new Prisma.Decimal(med),
              currency: "EUR",
              source: "live_scrape",
              sampleSize: pool.length,
              metadata: {
                source: dominant,
                concelho: spec.concelho,
              } satisfies Prisma.InputJsonValue,
            },
          }),
          prisma.realAsset.update({
            where: { id: asset.id },
            data: {
              currentValue: new Prisma.Decimal(med),
              currentValueEur: new Prisma.Decimal(med),
              currentValueUpdatedAt: new Date(),
              currentValueSource: "live_scrape",
              // Promote no_data → done. Initial backfill may have come up empty
              // for this spec (e.g. Web Archive coverage gap), but once a live
              // scrape lands, the asset has data — flip the flag so the chart
              // stops showing the empty state.
              backfillStatus: "done",
              backfillProgress: 100,
            },
          }),
        ]);
        propertyAssetsUpdated++;
      }
    } catch (err) {
      propertySpecsFailed++;
      console.error(`[cron/scrape-comparables] property spec failed:`, spec.key, err);
    }
  }

  return NextResponse.json({
    ok: true,
    tookMs: Date.now() - startedAt,
    vehicles: {
      specsScraped: vehicleSpecsScraped,
      specsFailed: vehicleSpecsFailed,
      assetsUpdated: vehicleAssetsUpdated,
    },
    properties: {
      specsScraped: propertySpecsScraped,
      specsFailed: propertySpecsFailed,
      assetsUpdated: propertyAssetsUpdated,
    },
  });
}
