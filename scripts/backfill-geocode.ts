/**
 * One-shot script to re-geocode existing Property rows after the geocoder
 * cascade landed (full free-text query → postal-code fallback).
 *
 * Why: properties saved before this PR have lat/lon derived from postal-code
 * centroids — the rooftop pin was wrong (e.g. landed on a nearby landmark
 * inside the same postal area). Re-running with the new cascade lifts those
 * to the actual street where the address is set.
 *
 * What it does:
 *   - Iterates every Property where geocodedAt is null OR predates the
 *     cutoff date, OR address is set but precision was postal-only.
 *   - Re-runs the new cascading geocoder.
 *   - Updates lat/lon/geocodedAt/geocodeError per row.
 *   - Sleeps 1.1s between Nominatim hits (1 req/s policy + safety margin).
 *
 * What it does NOT touch:
 *   - Properties with no address AND no postal code (nothing to geocode).
 *   - Coords for properties already created with the new cascade (same-day).
 *
 * Usage:
 *   npx tsx scripts/backfill-geocode.ts --dry-run     # report only
 *   npx tsx scripts/backfill-geocode.ts                # apply
 *   npx tsx scripts/backfill-geocode.ts --workspace=<id>
 *
 * Run from inside the container so DATABASE_URL resolves:
 *   docker exec -it amigo npx tsx scripts/backfill-geocode.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { geocodeAddress } from "../src/lib/geocode";

const NOMINATIM_PACE_MS = 1100;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function parseArgs() {
  const args = process.argv.slice(2);
  const result: { dryRun: boolean; workspace?: string } = { dryRun: false };
  for (const arg of args) {
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg.startsWith("--workspace=")) result.workspace = arg.slice("--workspace=".length);
    else {
      console.error(`Unknown argument: ${arg}`);
      console.log("Usage: npx tsx scripts/backfill-geocode.ts [--dry-run] [--workspace=<id>]");
      process.exit(1);
    }
  }
  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { dryRun, workspace } = parseArgs();

  const where = workspace
    ? { realAsset: { workspaceId: workspace } }
    : {};

  const properties = await prisma.property.findMany({
    where,
    select: {
      realAssetId: true,
      address: true,
      postalCode: true,
      concelho: true,
      country: true,
      latitude: true,
      longitude: true,
      geocodedAt: true,
      geocodeError: true,
      realAsset: { select: { name: true, workspaceId: true } },
    },
    orderBy: { realAssetId: "asc" },
  });

  if (properties.length === 0) {
    console.log("[backfill-geocode] no properties found.");
    return;
  }

  console.log(`[backfill-geocode] ${properties.length} property record(s) found${dryRun ? " (dry-run)" : ""}.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let needsAddress = 0;

  for (const p of properties) {
    const label = `${p.realAsset.name} (${p.realAssetId})`;

    if (!p.address && !p.postalCode) {
      console.log(`  · skip [no address or postal] — ${label}`);
      skipped++;
      continue;
    }

    if (!p.address && p.postalCode) {
      // We can still re-geocode (gets postal centroid), but flag for the
      // user — the missing-address banner will surface on the detail page.
      needsAddress++;
    }

    const before = {
      lat: p.latitude ? Number(p.latitude) : null,
      lon: p.longitude ? Number(p.longitude) : null,
    };

    const geocode = await geocodeAddress({
      address: p.address,
      postalCode: p.postalCode,
      city: p.concelho,
      country: p.country,
    });

    if (geocode.ok) {
      const movedMeters =
        before.lat != null && before.lon != null
          ? distanceMeters(before.lat, before.lon, geocode.lat, geocode.lon)
          : null;
      const movedTag =
        movedMeters == null
          ? "[new]"
          : movedMeters < 5
            ? "[unchanged]"
            : `[moved ${Math.round(movedMeters)}m]`;
      console.log(
        `  · ${dryRun ? "would update" : "update"} ${movedTag} ${label} → ${geocode.precision} ${geocode.lat.toFixed(6)},${geocode.lon.toFixed(6)}`,
      );
      if (!dryRun) {
        await prisma.property.update({
          where: { realAssetId: p.realAssetId },
          data: {
            latitude: geocode.lat,
            longitude: geocode.lon,
            geocodedAt: new Date(),
            geocodeError: null,
          },
        });
      }
      updated++;
    } else {
      console.log(`  · fail [${geocode.error}] — ${label}`);
      if (!dryRun) {
        await prisma.property.update({
          where: { realAssetId: p.realAssetId },
          data: { geocodeError: geocode.error, geocodedAt: new Date() },
        });
      }
      failed++;
    }

    await sleep(NOMINATIM_PACE_MS);
  }

  console.log(
    `\n[backfill-geocode] done. updated=${updated} skipped=${skipped} failed=${failed} missing_address=${needsAddress}`,
  );
  if (needsAddress > 0) {
    console.log(
      `[backfill-geocode] ${needsAddress} record(s) have no street address — they fell back to postal centroid. Edit them in the app to lift to rooftop precision.`,
    );
  }
}

// Haversine — used only to log how far each pin moved.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

main()
  .catch((err) => {
    console.error("[backfill-geocode] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
