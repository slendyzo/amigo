import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { getSplitBalances } from "@/lib/split-balances";

/**
 * GET /api/splits/balances
 *
 * Returns the active workspace's per-member settle-up summary, from the
 * caller's point of view: who owes them, who they owe, plus a roll-up of
 * ad-hoc participants they've fronted for.
 *
 * Forest & Bracket — Wave 1.
 */
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace, membershipId } = context;

    const result = await getSplitBalances(workspace.id, membershipId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/splits/balances] failed:", err);
    return NextResponse.json(
      { error: "Failed to compute split balances" },
      { status: 500 },
    );
  }
}
