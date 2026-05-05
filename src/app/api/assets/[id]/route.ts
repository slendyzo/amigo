import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { computeVehicleHeuristicValue } from "@/lib/asset-valuation";
import { geocodeAddress } from "@/lib/geocode";
import { regeneratePropertyValuationHistory } from "@/lib/property-valuation-regen";
import { enqueueBackfill } from "@/lib/asset-backfill";
import {
  requireActiveWorkspace,
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

const VALID_FUEL = ["PETROL", "DIESEL", "HYBRID", "EV", "OTHER"] as const;
const VALID_BODY = [
  // Cars
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "WAGON",
  "COUPE",
  "CONVERTIBLE",
  "TRUCK",
  // Motorcycles
  "NAKED",
  "SPORT",
  "CRUISER",
  "TOURING",
  "ADVENTURE",
  "SCOOTER",
  "OFF_ROAD",
  "OTHER",
] as const;

const VALID_PROPERTY_TYPES = [
  "APARTMENT",
  "HOUSE",
  "LAND",
  "COMMERCIAL",
  "OTHER",
] as const;

const VALID_ENERGY = [
  "A_PLUS",
  "A",
  "B",
  "B_MINUS",
  "C",
  "D",
  "E",
  "F",
] as const;

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("Asset API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

const detailInclude = {
  vehicle: true,
  property: true,
  liabilities: true,
  valuationHistory: { orderBy: { recordedAt: "desc" as const }, take: 90 },
  expenses: {
    select: {
      id: true,
      name: true,
      amount: true,
      amountEur: true,
      currency: true,
      date: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" as const },
    take: 50,
  },
} satisfies Prisma.RealAssetInclude;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await params;

    const asset = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      include: detailInclude,
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ asset });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("real_asset:update");
    const { id } = await params;

    const existing = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { vehicle: true, property: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    // ─── Asset-level fields (shared by vehicle + property) ──────────────────
    const assetData: Prisma.RealAssetUpdateInput = {};
    if (typeof body.name === "string") assetData.name = body.name.trim();
    if (typeof body.notes === "string") assetData.notes = body.notes;
    if (typeof body.imageUrl === "string") assetData.imageUrl = body.imageUrl;

    let priceChanged = false;
    let newPurchasePrice: number | null = null;
    let newPurchaseCurrency = existing.purchaseCurrency;
    let newPurchasePriceEur = Number(existing.purchasePriceEur);
    if (typeof body.purchasePrice === "number" && body.purchasePrice > 0) {
      const currency =
        typeof body.purchaseCurrency === "string"
          ? body.purchaseCurrency
          : existing.purchaseCurrency;
      const { amountEur } = await convertToEur(body.purchasePrice, currency);
      assetData.purchasePrice = new Prisma.Decimal(body.purchasePrice);
      assetData.purchaseCurrency = currency;
      assetData.purchasePriceEur = new Prisma.Decimal(amountEur);
      newPurchasePrice = body.purchasePrice;
      newPurchaseCurrency = currency;
      newPurchasePriceEur = amountEur;
      priceChanged = amountEur !== Number(existing.purchasePriceEur);
    }

    let dateChanged = false;
    let newPurchaseDate = existing.purchaseDate;
    if (typeof body.purchaseDate === "string") {
      const parsed = new Date(body.purchaseDate);
      if (!Number.isNaN(parsed.getTime())) {
        assetData.purchaseDate = parsed;
        newPurchaseDate = parsed;
        dateChanged = parsed.getTime() !== existing.purchaseDate.getTime();
      }
    }

    // ─── Vehicle branch (unchanged contract for AMIGO-164/165) ──────────────
    if (existing.type === "VEHICLE") {
      const vehicleInput = (body.vehicle ?? {}) as Record<string, unknown>;
      const vehicleData: Prisma.VehicleUpdateInput = {};

      // AMIGO-203: detect spec changes (brand/model/year/trim) so we can
      // discard scraped + estimated valuation rows after the update commits.
      // Manual rows + purchase row are preserved — those are facts about
      // THIS asset regardless of how it's labelled.
      let specChanged = false;
      if (typeof vehicleInput.brand === "string") vehicleData.brand = vehicleInput.brand.trim();
      if (typeof vehicleInput.model === "string") vehicleData.model = vehicleInput.model.trim();
      if (typeof vehicleInput.generation === "string") vehicleData.generation = vehicleInput.generation;
      if (typeof vehicleInput.year === "number") vehicleData.year = vehicleInput.year;
      if (typeof vehicleInput.trim === "string") vehicleData.trim = vehicleInput.trim;
      if (existing.vehicle) {
        const newBrand = (vehicleData.brand as string | undefined) ?? existing.vehicle.brand;
        const newModel = (vehicleData.model as string | undefined) ?? existing.vehicle.model;
        const newYear = (vehicleData.year as number | undefined) ?? existing.vehicle.year;
        const newTrim =
          vehicleData.trim !== undefined
            ? (vehicleData.trim as string | null)
            : existing.vehicle.trim;
        specChanged =
          newBrand !== existing.vehicle.brand ||
          newModel !== existing.vehicle.model ||
          newYear !== existing.vehicle.year ||
          (newTrim ?? null) !== (existing.vehicle.trim ?? null);
      }

      if (typeof vehicleInput.vin === "string") vehicleData.vin = vehicleInput.vin;
      if (typeof vehicleInput.plate === "string") vehicleData.plate = vehicleInput.plate;
      if (typeof vehicleInput.color === "string") vehicleData.color = vehicleInput.color;
      if (
        typeof vehicleInput.fuelType === "string" &&
        VALID_FUEL.includes(vehicleInput.fuelType as (typeof VALID_FUEL)[number])
      ) {
        vehicleData.fuelType = vehicleInput.fuelType as (typeof VALID_FUEL)[number];
      }
      if (
        typeof vehicleInput.bodyType === "string" &&
        VALID_BODY.includes(vehicleInput.bodyType as (typeof VALID_BODY)[number])
      ) {
        vehicleData.bodyType = vehicleInput.bodyType as (typeof VALID_BODY)[number];
      }

      let mileageChanged = false;
      if (typeof vehicleInput.mileage === "number") {
        vehicleData.mileage = vehicleInput.mileage;
        vehicleData.mileageUpdatedAt = new Date();
        mileageChanged = vehicleInput.mileage !== existing.vehicle?.mileage;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const a = await tx.realAsset.update({ where: { id }, data: assetData });
        if (Object.keys(vehicleData).length > 0 && existing.vehicle) {
          await tx.vehicle.update({ where: { realAssetId: id }, data: vehicleData });
        }

        const yearAfter = (vehicleData.year as number | undefined) ?? existing.vehicle?.year;
        const mileageAfter =
          (vehicleData.mileage as number | undefined) ?? existing.vehicle?.mileage ?? null;
        const purchasePriceEurAfter = Number(a.purchasePriceEur);

        const heuristic =
          Number.isFinite(yearAfter) &&
          purchasePriceEurAfter > 0 &&
          (mileageChanged || vehicleData.year != null)
            ? computeVehicleHeuristicValue({
                purchasePriceEur: purchasePriceEurAfter,
                year: yearAfter as number,
                mileage: mileageAfter,
              })
            : null;

        if (heuristic) {
          await tx.valuationHistory.create({
            data: {
              realAssetId: id,
              value: new Prisma.Decimal(heuristic.valueEur),
              valueEur: new Prisma.Decimal(heuristic.valueEur),
              currency: "EUR",
              source: "heuristic",
            },
          });
          await tx.realAsset.update({
            where: { id },
            data: {
              currentValue: new Prisma.Decimal(heuristic.valueEur),
              currentValueEur: new Prisma.Decimal(heuristic.valueEur),
              currentValueUpdatedAt: new Date(),
              currentValueSource: "heuristic",
            },
          });
        }

        return tx.realAsset.findUnique({ where: { id }, include: detailInclude });
      });

      // AMIGO-203: spec changed → wipe scraped/estimated/legacy-heuristic
      // rows (manual + purchase rows are preserved) and re-fire backfill.
      if (specChanged) {
        await prisma.valuationHistory.deleteMany({
          where: {
            realAssetId: id,
            source: { in: ["web_archive", "live_scrape", "ai_estimate", "heuristic"] },
          },
        });
        void enqueueBackfill(id).catch((err) =>
          console.error("[PUT /api/assets] enqueueBackfill after spec change failed:", err),
        );
      }

      return NextResponse.json({ asset: updated });
    }

    // ─── Property branch ────────────────────────────────────────────────────
    if (!existing.property) {
      return NextResponse.json({ error: "Property record missing" }, { status: 500 });
    }

    const propertyInput = (body.property ?? {}) as Record<string, unknown>;
    const propertyData: Prisma.PropertyUpdateInput = {};

    const strField = (key: string): string | null | undefined => {
      if (!(key in propertyInput)) return undefined;
      const v = propertyInput[key];
      if (v === null) return null;
      if (typeof v !== "string") return undefined;
      const trimmed = v.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const intField = (key: string): number | null | undefined => {
      if (!(key in propertyInput)) return undefined;
      const v = propertyInput[key];
      if (v === null) return null;
      if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
      return Math.trunc(v);
    };

    if (
      typeof propertyInput.propertyType === "string" &&
      VALID_PROPERTY_TYPES.includes(
        propertyInput.propertyType as (typeof VALID_PROPERTY_TYPES)[number],
      )
    ) {
      propertyData.propertyType = propertyInput.propertyType as (typeof VALID_PROPERTY_TYPES)[number];
    }

    const setIfDefined = <K extends keyof Prisma.PropertyUpdateInput>(
      key: K,
      value: Prisma.PropertyUpdateInput[K] | undefined,
    ) => {
      if (value !== undefined) propertyData[key] = value;
    };

    // Address — change here also triggers re-geocode (handled below alongside postalCode).
    let addressChanged = false;
    let nextAddress = existing.property.address;
    if ("address" in propertyInput) {
      const next = strField("address");
      if (next !== undefined) {
        propertyData.address = next;
        nextAddress = next;
        addressChanged = (next ?? null) !== (existing.property.address ?? null);
      }
    }
    setIfDefined("distrito", strField("distrito"));
    setIfDefined("freguesia", strField("freguesia"));
    setIfDefined("country", strField("country") ?? undefined);
    setIfDefined("livableAreaM2", intField("livableAreaM2"));
    setIfDefined("totalAreaM2", intField("totalAreaM2"));
    setIfDefined("bedrooms", intField("bedrooms"));
    setIfDefined("bathrooms", intField("bathrooms"));
    setIfDefined("yearBuilt", intField("yearBuilt"));
    setIfDefined("floor", intField("floor"));
    setIfDefined("parkingSpaces", intField("parkingSpaces"));

    if ("energyRating" in propertyInput) {
      const v = propertyInput.energyRating;
      if (v === null || v === "") {
        propertyData.energyRating = null;
      } else if (
        typeof v === "string" &&
        VALID_ENERGY.includes(v as (typeof VALID_ENERGY)[number])
      ) {
        propertyData.energyRating = v as (typeof VALID_ENERGY)[number];
      }
    }

    // Concelho — change here triggers INE regen.
    let concelhoChanged = false;
    let newConcelho = existing.property.concelho;
    if ("concelho" in propertyInput) {
      const next = strField("concelho");
      if (next !== undefined) {
        propertyData.concelho = next;
        newConcelho = next;
        concelhoChanged = (next ?? null) !== (existing.property.concelho ?? null);
      }
    }

    // Postal code — change here triggers re-geocode.
    let geocodeFailureReason: string | null = null;
    let postalCodeChanged = false;
    let nextPostalCode = existing.property.postalCode;
    if ("postalCode" in propertyInput) {
      const next = strField("postalCode");
      if (next !== undefined) {
        propertyData.postalCode = next;
        nextPostalCode = next;
        postalCodeChanged = (next ?? null) !== (existing.property.postalCode ?? null);
      }
    }

    const needsRegeocode = (addressChanged || postalCodeChanged) && (nextAddress || nextPostalCode);
    if (needsRegeocode) {
      const country =
        (propertyData.country as string | undefined) ??
        existing.property.country ??
        "PT";
      const concelho =
        (propertyData.concelho as string | undefined) ??
        existing.property.concelho ??
        null;
      const geocode = await geocodeAddress({
        address: nextAddress,
        postalCode: nextPostalCode,
        city: concelho,
        country,
      });
      if (geocode.ok) {
        propertyData.latitude = new Prisma.Decimal(geocode.lat);
        propertyData.longitude = new Prisma.Decimal(geocode.lon);
        propertyData.geocodedAt = new Date();
        propertyData.geocodeError = null;
      } else {
        propertyData.latitude = null;
        propertyData.longitude = null;
        propertyData.geocodedAt = null;
        propertyData.geocodeError = geocode.error;
        geocodeFailureReason = geocode.error;
      }
    } else if ((addressChanged || postalCodeChanged) && !nextAddress && !nextPostalCode) {
      // Cleared both location fields — drop the cached coords too.
      propertyData.latitude = null;
      propertyData.longitude = null;
      propertyData.geocodedAt = null;
      propertyData.geocodeError = null;
    }

    const needsRegen = priceChanged || dateChanged || concelhoChanged;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.realAsset.update({ where: { id }, data: assetData });
      if (Object.keys(propertyData).length > 0) {
        await tx.property.update({ where: { realAssetId: id }, data: propertyData });
      }

      if (needsRegen) {
        await regeneratePropertyValuationHistory(tx, {
          realAssetId: id,
          baselineDate: newPurchaseDate,
          baselinePrice: newPurchasePrice ?? Number(existing.purchasePrice),
          baselineEur: newPurchasePriceEur,
          baselineCurrency: newPurchaseCurrency,
          concelho: newConcelho,
        });

        // Mirror final value into RealAsset (the regen helper wrote
        // ValuationHistory but doesn't touch the asset's currentValue snapshot).
        const latest = await tx.valuationHistory.findFirst({
          where: { realAssetId: id },
          orderBy: { recordedAt: "desc" },
        });
        if (latest) {
          await tx.realAsset.update({
            where: { id },
            data: {
              currentValue: latest.value,
              currentValueEur: latest.valueEur,
              currentValueUpdatedAt: new Date(),
              currentValueSource: latest.source,
            },
          });
        }
      }

      return tx.realAsset.findUnique({ where: { id }, include: detailInclude });
    });

    return NextResponse.json({
      asset: updated,
      ...(geocodeFailureReason ? { geocodeError: geocodeFailureReason } : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("real_asset:delete");
    const { id } = await params;

    const existing = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.realAsset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
