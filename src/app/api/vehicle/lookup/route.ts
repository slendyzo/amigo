import { NextResponse } from "next/server";
import { lookupVehicleSpec } from "@/lib/vehicle-spec-lookup";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    await requireActiveWorkspace();
    const body = (await request.json()) as Record<string, unknown>;

    const brand = typeof body.brand === "string" ? body.brand.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    const year = typeof body.year === "number" ? body.year : NaN;
    const trim = typeof body.trim === "string" ? body.trim.trim() : null;

    if (!brand || !model || !Number.isFinite(year)) {
      return NextResponse.json({ error: "brand, model, year required" }, { status: 400 });
    }

    const spec = await lookupVehicleSpec({ brand, model, year, trim });
    return NextResponse.json({ spec });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Vehicle lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
