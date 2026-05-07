// Comparables resolver: given an asset whose currentValue came from a
// market scrape (live_scrape | web_archive), find the latest matching
// SpecMarketSnapshot and return the listings that produced the median.
//
// The same area-band / mileage-band filter the scrape cron applies is
// re-applied here so the modal shows exactly the listings that drove the
// number — not the raw unfiltered pool.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  ParsedPropertyListing,
  ParsedVehicleListing,
} from "@/lib/listing-html-parser";

const MILEAGE_BAND = 0.15;
const AREA_BAND = 0.15;
const MAX_LISTINGS = 100;

const VEHICLE_LIVE_SOURCES = ["standvirtual_live", "olx_live"] as const;
const PROPERTY_LIVE_SOURCES = ["idealista_live", "imovirtual_live"] as const;

const SUPPORTED_VALUE_SOURCES = new Set([
  "live_scrape",
  "web_archive",
]);

export type ComparableListing = {
  price: number;
  currency: string;
  source: string;
  url: string | null;
  urlStatus: "alive" | "dead" | "unknown";
  // Property fields
  propertyType?: string | null;
  areaM2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  location?: string | null;
  // Vehicle fields
  year?: number | null;
  mileage?: number | null;
  trim?: string | null;
};

export type UserAssetRef =
  | {
      assetType: "property";
      propertyType: string;
      areaM2: number | null;
      bedrooms: number | null;
      location: string | null;
    }
  | {
      assetType: "vehicle";
      year: number;
      brand: string;
      model: string;
      trim: string | null;
      mileage: number | null;
    };

export type ComparablesPayload =
  | { available: false; reason: "unsupported_source" | "no_snapshot" | "no_listings" }
  | {
      available: true;
      summary: {
        medianEur: number;
        sampleSize: number;
        totalCount: number;
        sources: string[];
        scrapedAt: string;
        filter: "area" | "mileage" | "none";
        userAsset: UserAssetRef;
      };
      listings: ComparableListing[];
    };

type AssetWithRelations = Prisma.RealAssetGetPayload<{
  include: { vehicle: true; property: true };
}>;

function vehicleSpecHash(year: number, make: string, model: string, trim: string | null): string {
  return createHash("sha256")
    .update(`${year}|${make}|${model}|${trim ?? ""}`)
    .digest("hex");
}

function propertySpecHash(
  concelho: string,
  propertyType: string,
  livableAreaM2: number | null,
  bedrooms: number | null,
): string {
  const areaBand = livableAreaM2 != null ? Math.round(livableAreaM2 / 25) * 25 : 0;
  const bedBand = bedrooms ?? 0;
  const key = `${concelho}|${propertyType}|${areaBand}|${bedBand}`;
  return createHash("sha256").update(`prop|${key}`).digest("hex");
}

function median(prices: number[]): number {
  return prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
}

function sourceLabel(rawSource: string): string {
  // Map the scraped-source tag to a clean per-listing source name.
  if (rawSource.startsWith("standvirtual")) return "standvirtual";
  if (rawSource.startsWith("olx")) return "olx";
  if (rawSource.startsWith("idealista")) return "idealista";
  if (rawSource.startsWith("imovirtual")) return "imovirtual";
  if (rawSource === "web_archive") return "web_archive";
  return rawSource;
}

// Some scrapes wrote relative paths (e.g. "/pt/anuncio/...") instead of full
// URLs into the listing JSON. Reattach the source's origin so links work
// outside of amigo.slendyzo.pt.
const SOURCE_ORIGINS: Record<string, string> = {
  idealista: "https://www.idealista.pt",
  imovirtual: "https://www.imovirtual.com",
  standvirtual: "https://www.standvirtual.com",
  olx: "https://www.olx.pt",
};

function absolutizeUrl(url: string | null | undefined, source: string): string | null {
  if (!url || typeof url !== "string") return null;
  if (/^https?:\/\//i.test(url)) return url;
  const origin = SOURCE_ORIGINS[source];
  if (!origin) return null;
  return url.startsWith("/") ? `${origin}${url}` : `${origin}/${url}`;
}

export async function getComparablesForAsset(
  asset: AssetWithRelations,
): Promise<ComparablesPayload> {
  const valueSource = asset.currentValueSource;
  if (!valueSource || !SUPPORTED_VALUE_SOURCES.has(valueSource)) {
    return { available: false, reason: "unsupported_source" };
  }

  // Resolve which snapshot source(s) we should look in
  const isVehicle = asset.type === "VEHICLE";
  const sourceFilter: string[] =
    valueSource === "web_archive"
      ? ["web_archive"]
      : isVehicle
        ? [...VEHICLE_LIVE_SOURCES]
        : [...PROPERTY_LIVE_SOURCES];

  // Compute spec hash for the asset
  let specHash: string;
  let userAsset: UserAssetRef;
  let filter: "area" | "mileage" | "none" = "none";
  let ownAreaM2: number | null = null;
  let ownMileage: number | null = null;

  if (isVehicle) {
    if (!asset.vehicle) return { available: false, reason: "no_snapshot" };
    const v = asset.vehicle;
    specHash = vehicleSpecHash(v.year, v.brand, v.model, v.trim ?? null);
    ownMileage = v.mileage ?? null;
    filter = "mileage";
    userAsset = {
      assetType: "vehicle",
      year: v.year,
      brand: v.brand,
      model: v.model,
      trim: v.trim ?? null,
      mileage: v.mileage ?? null,
    };
  } else {
    const p = asset.property;
    if (!p || !p.concelho) return { available: false, reason: "no_snapshot" };
    specHash = propertySpecHash(p.concelho, p.propertyType, p.livableAreaM2, p.bedrooms);
    ownAreaM2 = p.livableAreaM2 ?? null;
    filter = "area";
    userAsset = {
      assetType: "property",
      propertyType: p.propertyType,
      areaM2: p.livableAreaM2 ?? null,
      bedrooms: p.bedrooms ?? null,
      location: p.concelho,
    };
  }

  const snapshot = await prisma.specMarketSnapshot.findFirst({
    where: { specHash, source: { in: sourceFilter } },
    orderBy: { scrapedAt: "desc" },
  });
  if (!snapshot) return { available: false, reason: "no_snapshot" };

  // The listings JSON is either ParsedVehicleListing[] or ParsedPropertyListing[]
  const rawListings = (snapshot.listings as unknown) as Array<
    ParsedVehicleListing | ParsedPropertyListing
  >;
  if (!Array.isArray(rawListings) || rawListings.length === 0) {
    return { available: false, reason: "no_listings" };
  }

  // Apply the same filter the cron uses to derive the median.
  let pool: Array<ParsedVehicleListing | ParsedPropertyListing> = rawListings.filter(
    (l) => typeof l.price === "number" && l.price > 0,
  );

  if (isVehicle && ownMileage != null && ownMileage > 0) {
    const filtered = pool.filter((l) => {
      const m = (l as ParsedVehicleListing).mileage;
      if (m == null) return true;
      const ratio = m / ownMileage;
      return ratio >= 1 - MILEAGE_BAND && ratio <= 1 + MILEAGE_BAND;
    });
    if (filtered.length >= 3) pool = filtered;
  } else if (!isVehicle && ownAreaM2 != null && ownAreaM2 > 0) {
    const filtered = pool.filter((l) => {
      const a = (l as ParsedPropertyListing).areaM2;
      if (a == null) return true;
      const ratio = a / ownAreaM2;
      return ratio >= 1 - AREA_BAND && ratio <= 1 + AREA_BAND;
    });
    if (filtered.length >= 3) pool = filtered;
  }

  if (pool.length === 0) return { available: false, reason: "no_listings" };

  const totalCount = pool.length;
  const med = median(pool.map((l) => l.price));

  // Sort by closeness to median, take top N
  const sorted = pool
    .slice()
    .sort((a, b) => Math.abs(a.price - med) - Math.abs(b.price - med));
  const trimmed = sorted.slice(0, MAX_LISTINGS);

  // Each listing's source label comes from the snapshot's source tag (the
  // dominant scrape provider). For mixed snapshots we don't currently track
  // per-listing provenance, so all listings share the snapshot source.
  const labeledSource = sourceLabel(snapshot.source);
  const sourcesSet = new Set<string>([labeledSource]);

  // Absolutize URLs (some legacy scrapes stored relative paths) and look up
  // health for the resulting absolute URLs.
  const absolutized = trimmed.map((l) => ({
    listing: l,
    url: absolutizeUrl(l.url, labeledSource),
  }));
  const urls = absolutized
    .map((x) => x.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  const health = urls.length
    ? await prisma.listingHealthCheck.findMany({
        where: { url: { in: urls } },
        select: { url: true, status: true },
      })
    : [];
  const healthMap = new Map<string, "alive" | "dead" | "unknown">(
    health.map((h) => [h.url, h.status as "alive" | "dead" | "unknown"]),
  );

  const listings: ComparableListing[] = absolutized.map(({ listing: l, url }) => {
    const status: "alive" | "dead" | "unknown" =
      url && healthMap.has(url) ? healthMap.get(url)! : "unknown";
    if (isVehicle) {
      const v = l as ParsedVehicleListing;
      return {
        price: v.price,
        currency: v.currency,
        source: labeledSource,
        url,
        urlStatus: status,
        year: v.year ?? null,
        mileage: v.mileage ?? null,
        trim: v.trim ?? null,
      };
    }
    const p = l as ParsedPropertyListing;
    return {
      price: p.price,
      currency: p.currency,
      source: labeledSource,
      url,
      urlStatus: status,
      propertyType: p.propertyType ?? null,
      areaM2: p.areaM2 ?? null,
      bedrooms: p.bedrooms ?? null,
      bathrooms: p.bathrooms ?? null,
      location: p.location ?? null,
    };
  });

  return {
    available: true,
    summary: {
      medianEur: Math.round(med * 100) / 100,
      sampleSize: totalCount,
      totalCount,
      sources: Array.from(sourcesSet),
      scrapedAt: snapshot.scrapedAt.toISOString(),
      filter,
      userAsset,
    },
    listings,
  };
}
