import { NextResponse } from "next/server";
import { fetchTaxonomyLevel, parseTaxonomyRequest } from "@/lib/vehicle-taxonomy";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// GET /api/taxonomy/vehicle?year=2019                       → makes
// GET /api/taxonomy/vehicle?year=2019&make=Mazda            → models
// GET /api/taxonomy/vehicle?year=2019&make=Mazda&model=MX-5 → trims
//
// Cache hit: instant DB read. Cache miss: fires Z.AI GLM-4.6 (one call), upserts,
// returns. Concurrent misses are deduped via an in-flight promise map in the lib.
export async function GET(request: Request) {
  try {
    await requireActiveWorkspace();

    const url = new URL(request.url);
    const parsed = parseTaxonomyRequest(url.searchParams);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const values = await fetchTaxonomyLevel(parsed.level, parsed.parentKey);
    return NextResponse.json({ level: parsed.level, values });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[/api/taxonomy/vehicle]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
