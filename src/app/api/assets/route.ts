import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { computeVehicleHeuristicValue } from "@/lib/asset-valuation";
import {
  requireActiveWorkspace,
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

const VALID_TYPES = ["VEHICLE", "PROPERTY"] as const;
type RealAssetType = (typeof VALID_TYPES)[number];

const VALID_STATUSES = ["ACTIVE", "SOLD"] as const;
type RealAssetStatus = (typeof VALID_STATUSES)[number];

const VALID_FUEL = ["PETROL", "DIESEL", "HYBRID", "EV", "OTHER"] as const;
const VALID_BODY = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "WAGON",
  "COUPE",
  "CONVERTIBLE",
  "TRUCK",
  "OTHER",
] as const;

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("Asset API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

const assetInclude = {
  vehicle: true,
  liabilities: {
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      currentBalance: true,
      currentBalanceEur: true,
      monthlyPayment: true,
      currency: true,
    },
  },
  valuationHistory: {
    orderBy: { recordedAt: "desc" as const },
    take: 1,
    select: { id: true, valueEur: true, value: true, currency: true, source: true, recordedAt: true },
  },
} satisfies Prisma.RealAssetInclude;

export async function GET(request: Request) {
  try {
    const { workspace } = await requireActiveWorkspace();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as RealAssetType | null;
    const status = searchParams.get("status") as RealAssetStatus | null;

    const where: Prisma.RealAssetWhereInput = { workspaceId: workspace.id };
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (status && VALID_STATUSES.includes(status)) where.status = status;

    const assets = await prisma.realAsset.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: assetInclude,
    });

    return NextResponse.json({ assets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requirePermission("real_asset:create");
    const body = (await request.json()) as Record<string, unknown>;

    const type = body.type as RealAssetType | undefined;
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
    }
    if (type === "PROPERTY") {
      return NextResponse.json({ error: "PROPERTY type not yet supported" }, { status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const purchasePrice = typeof body.purchasePrice === "number" ? body.purchasePrice : NaN;
    if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
      return NextResponse.json({ error: "purchasePrice must be a positive number" }, { status: 400 });
    }

    const purchaseCurrency =
      typeof body.purchaseCurrency === "string" ? body.purchaseCurrency : workspace.defaultCurrency || "EUR";
    const purchaseDateRaw = body.purchaseDate;
    const purchaseDate =
      typeof purchaseDateRaw === "string" || purchaseDateRaw instanceof Date
        ? new Date(purchaseDateRaw as string)
        : new Date();

    const { amountEur: purchasePriceEur } = await convertToEur(purchasePrice, purchaseCurrency);

    const vehicleInput = (body.vehicle ?? {}) as Record<string, unknown>;
    const brand = typeof vehicleInput.brand === "string" ? vehicleInput.brand.trim() : "";
    const model = typeof vehicleInput.model === "string" ? vehicleInput.model.trim() : "";
    const year = typeof vehicleInput.year === "number" ? vehicleInput.year : NaN;

    if (!brand || !model || !Number.isFinite(year)) {
      return NextResponse.json(
        { error: "vehicle.brand, vehicle.model, and vehicle.year are required" },
        { status: 400 }
      );
    }

    const mileage = typeof vehicleInput.mileage === "number" ? vehicleInput.mileage : null;
    const fuelType =
      typeof vehicleInput.fuelType === "string" && VALID_FUEL.includes(vehicleInput.fuelType as (typeof VALID_FUEL)[number])
        ? (vehicleInput.fuelType as (typeof VALID_FUEL)[number])
        : null;
    const bodyType =
      typeof vehicleInput.bodyType === "string" && VALID_BODY.includes(vehicleInput.bodyType as (typeof VALID_BODY)[number])
        ? (vehicleInput.bodyType as (typeof VALID_BODY)[number])
        : null;

    // Initial valuation: heuristic if we can compute (year + mileage available),
    // else just the purchase price.
    const heuristic =
      Number.isFinite(year) && purchasePriceEur > 0
        ? computeVehicleHeuristicValue({ purchasePriceEur, year, mileage })
        : null;
    const initialValueEur = heuristic ? heuristic.valueEur : purchasePriceEur;

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.realAsset.create({
        data: {
          workspaceId: workspace.id,
          type,
          name,
          status: "ACTIVE",
          purchasePrice: new Prisma.Decimal(purchasePrice),
          purchaseCurrency,
          purchasePriceEur: new Prisma.Decimal(purchasePriceEur),
          purchaseDate,
          currentValue: new Prisma.Decimal(initialValueEur),
          currentValueEur: new Prisma.Decimal(initialValueEur),
          currentValueUpdatedAt: new Date(),
          currentValueSource: heuristic ? "heuristic" : "manual",
          imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
          notes: typeof body.notes === "string" ? body.notes : null,
        },
      });

      await tx.vehicle.create({
        data: {
          realAssetId: created.id,
          brand,
          model,
          generation: typeof vehicleInput.generation === "string" ? vehicleInput.generation : null,
          year,
          trim: typeof vehicleInput.trim === "string" ? vehicleInput.trim : null,
          mileage,
          mileageUpdatedAt: mileage != null ? new Date() : null,
          vin: typeof vehicleInput.vin === "string" ? vehicleInput.vin : null,
          plate: typeof vehicleInput.plate === "string" ? vehicleInput.plate : null,
          color: typeof vehicleInput.color === "string" ? vehicleInput.color : null,
          fuelType,
          bodyType,
        },
      });

      // Seed valuation history with the purchase event.
      await tx.valuationHistory.create({
        data: {
          realAssetId: created.id,
          value: new Prisma.Decimal(purchasePrice),
          valueEur: new Prisma.Decimal(purchasePriceEur),
          currency: purchaseCurrency,
          source: "purchase",
          recordedAt: purchaseDate,
        },
      });

      // If we computed a heuristic that differs from the purchase, log it too.
      if (heuristic && Math.abs(heuristic.valueEur - purchasePriceEur) > 0.01) {
        await tx.valuationHistory.create({
          data: {
            realAssetId: created.id,
            value: new Prisma.Decimal(heuristic.valueEur),
            valueEur: new Prisma.Decimal(heuristic.valueEur),
            currency: "EUR",
            source: "heuristic",
          },
        });
      }

      return tx.realAsset.findUnique({ where: { id: created.id }, include: assetInclude });
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
