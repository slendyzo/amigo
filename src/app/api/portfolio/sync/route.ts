import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { syncExchange, syncAllExchanges } from "@/lib/exchanges/sync";

// POST - Trigger portfolio sync
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    let body: { connectionId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine
    }

    const { connectionId } = body;

    if (connectionId) {
      // Sync a single connection — verify workspace ownership first
      const connection = await prisma.exchangeConnection.findFirst({
        where: { id: connectionId, workspaceId: workspace.id },
      });

      if (!connection) {
        return NextResponse.json(
          { error: "Exchange connection not found" },
          { status: 404 }
        );
      }

      await syncExchange(connectionId);
      return NextResponse.json({ success: true });
    } else {
      // Sync all connections for this workspace
      const results = await syncAllExchanges(workspace.id);
      return NextResponse.json({ success: true, results });
    }
  } catch (error) {
    console.error("Portfolio sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync portfolio" },
      { status: 500 }
    );
  }
}
