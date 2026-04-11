import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import { createExchangeClient } from "@/lib/exchanges/factory";
import type { ExchangeProvider } from "@prisma/client";

const SAFE_SELECT = {
  id: true,
  provider: true,
  label: true,
  syncStatus: true,
  lastSyncAt: true,
  lastSyncError: true,
  freeCash: true,
  freeCashCurrency: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { assets: true },
  },
} as const;

function serializeConnection(
  c: { freeCash: { toNumber?: () => number } | null | number } & Record<
    string,
    unknown
  >
) {
  return {
    ...c,
    freeCash:
      c.freeCash !== null && c.freeCash !== undefined
        ? typeof c.freeCash === "object" && "toNumber" in (c.freeCash as object)
          ? (c.freeCash as { toNumber: () => number }).toNumber()
          : Number(c.freeCash)
        : null,
  };
}

// GET - Single exchange connection (no encrypted fields)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;
    const { id } = await params;

    const connection = await prisma.exchangeConnection.findFirst({
      where: { id, workspaceId: workspace.id },
      select: SAFE_SELECT,
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Exchange connection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ connection: serializeConnection(connection) });
  } catch (error) {
    console.error("Get exchange connection error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange connection" },
      { status: 500 }
    );
  }
}

// PUT - Update exchange connection
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;
    const { id } = await params;

    // Verify ownership
    const existing = await prisma.exchangeConnection.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Exchange connection not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { label, apiKey, apiSecret, isActive } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (label !== undefined) updateData.label = label;
    if (isActive !== undefined) updateData.isActive = isActive;

    // If new credentials are provided, re-encrypt
    if (apiKey !== undefined || apiSecret !== undefined) {
      // Resolve the current keys — decrypt existing if one of the two is missing
      let resolvedApiKey = apiKey;
      let resolvedApiSecret = apiSecret;

      if (!resolvedApiKey || !resolvedApiSecret) {
        if (!existing.encryptedApiKey || !existing.encryptionIV || !existing.encryptionTag) {
          return NextResponse.json(
            { error: "Cannot update credentials for a wallet connection" },
            { status: 400 }
          );
        }
        try {
          const decrypted = decrypt(
            existing.encryptedApiKey,
            existing.encryptionIV,
            existing.encryptionTag
          );
          const parsed = JSON.parse(decrypted) as {
            apiKey: string;
            apiSecret: string;
          };
          if (!resolvedApiKey) resolvedApiKey = parsed.apiKey;
          if (!resolvedApiSecret) resolvedApiSecret = parsed.apiSecret;
        } catch {
          return NextResponse.json(
            { error: "Failed to decrypt existing credentials" },
            { status: 500 }
          );
        }
      }

      const payload = JSON.stringify({
        apiKey: resolvedApiKey,
        apiSecret: resolvedApiSecret,
      });
      const { ciphertext, iv, tag } = encrypt(payload);
      updateData.encryptedApiKey = ciphertext;
      updateData.encryptedApiSecret = "";
      updateData.encryptionIV = iv;
      updateData.encryptionTag = tag;
    }

    const updated = await prisma.exchangeConnection.update({
      where: { id },
      data: updateData,
      select: SAFE_SELECT,
    });

    return NextResponse.json({ connection: serializeConnection(updated) });
  } catch (error) {
    console.error("Update exchange connection error:", error);
    return NextResponse.json(
      { error: "Failed to update exchange connection" },
      { status: 500 }
    );
  }
}

// DELETE - Delete exchange connection
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;
    const { id } = await params;

    // Verify ownership
    const existing = await prisma.exchangeConnection.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Exchange connection not found" },
        { status: 404 }
      );
    }

    await prisma.exchangeConnection.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete exchange connection error:", error);
    return NextResponse.json(
      { error: "Failed to delete exchange connection" },
      { status: 500 }
    );
  }
}
