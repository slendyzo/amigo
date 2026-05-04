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

const detailInclude = {
  vehicle: true,
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
      include: { vehicle: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const vehicleInput = (body.vehicle ?? {}) as Record<string, unknown>;

    const assetData: Prisma.RealAssetUpdateInput = {};
    const vehicleData: Prisma.VehicleUpdateInput = {};

    if (typeof body.name === "string") assetData.name = body.name.trim();
    if (typeof body.notes === "string") assetData.notes = body.notes;
    if (typeof body.imageUrl === "string") assetData.imageUrl = body.imageUrl;

    if (typeof body.purchasePrice === "number" && body.purchasePrice > 0) {
      const currency =
        typeof body.purchaseCurrency === "string" ? body.purchaseCurrency : existing.purchaseCurrency;
      const { amountEur } = await convertToEur(body.purchasePrice, currency);
      assetData.purchasePrice = new Prisma.Decimal(body.purchasePrice);
      assetData.purchaseCurrency = currency;
      assetData.purchasePriceEur = new Prisma.Decimal(amountEur);
    }
    if (typeof body.purchaseDate === "string") assetData.purchaseDate = new Date(body.purchaseDate);

    if (typeof vehicleInput.brand === "string") vehicleData.brand = vehicleInput.brand.trim();
    if (typeof vehicleInput.model === "string") vehicleData.model = vehicleInput.model.trim();
    if (typeof vehicleInput.generation === "string") vehicleData.generation = vehicleInput.generation;
    if (typeof vehicleInput.year === "number") vehicleData.year = vehicleInput.year;
    if (typeof vehicleInput.trim === "string") vehicleData.trim = vehicleInput.trim;
    if (typeof vehicleInput.vin === "string") vehicleData.vin = vehicleInput.vin;
    if (typeof vehicleInput.plate === "string") vehicleData.plate = vehicleInput.plate;
    if (typeof vehicleInput.color === "string") vehicleData.color = vehicleInput.color;
    if (typeof vehicleInput.fuelType === "string" && VALID_FUEL.includes(vehicleInput.fuelType as (typeof VALID_FUEL)[number])) {
      vehicleData.fuelType = vehicleInput.fuelType as (typeof VALID_FUEL)[number];
    }
    if (typeof vehicleInput.bodyType === "string" && VALID_BODY.includes(vehicleInput.bodyType as (typeof VALID_BODY)[number])) {
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

      // Recompute heuristic if year or mileage materially changed.
      const yearAfter = (vehicleData.year as number | undefined) ?? existing.vehicle?.year;
      const mileageAfter =
        (vehicleData.mileage as number | undefined) ?? existing.vehicle?.mileage ?? null;
      const purchasePriceEurAfter = Number(a.purchasePriceEur);

      const heuristic =
        existing.type === "VEHICLE" &&
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

    return NextResponse.json({ asset: updated });
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
