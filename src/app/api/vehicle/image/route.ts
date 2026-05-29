import { NextResponse } from "next/server";
import { lookupVehicleImage } from "@/lib/vehicle-image";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    await requireActiveWorkspace();
    const body = (await request.json()) as Record<string, unknown>;
    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const generation = typeof body.generation === "string" ? body.generation.trim() : null;
    const imageHint = typeof body.imageHint === "string" ? body.imageHint.trim() : null;
    const vehicleClass =
      body.vehicleClass === "CAR" || body.vehicleClass === "MOTORCYCLE" || body.vehicleClass === "BICYCLE"
        ? body.vehicleClass
        : undefined;

    if (!brand || !model) {
      return NextResponse.json({ error: "brand and model required" }, { status: 400 });
    }

    const image = await lookupVehicleImage({ brand, model, generation, imageHint, vehicleClass });
    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Vehicle image lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
