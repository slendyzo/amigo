import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { createExchangeClient, createWalletClient, isWalletProvider } from "@/lib/exchanges/factory";
import type { ExchangeProvider } from "@prisma/client";

// GET - List all exchange connections for the workspace
export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        provider: true,
        label: true,
        walletAddress: true,
        syncStatus: true,
        lastSyncAt: true,
        lastSyncError: true,
        freeCash: true,
        freeCashCurrency: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: { assets: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Convert Decimal fields to numbers
    const serialized = connections.map((c) => ({
      ...c,
      freeCash: c.freeCash !== null ? Number(c.freeCash) : null,
    }));

    return NextResponse.json({ connections: serialized });
  } catch (error) {
    console.error("Get exchange connections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange connections" },
      { status: 500 }
    );
  }
}

// POST - Create a new exchange connection
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const { searchParams } = new URL(request.url);
    const shouldTest = searchParams.get("test") === "true";

    const body = await request.json();
    const { provider, label, apiKey, apiSecret, walletAddress } = body;

    if (!provider || !label) {
      return NextResponse.json(
        { error: "provider and label are required" },
        { status: 400 }
      );
    }

    // Validate provider
    const validProviders: ExchangeProvider[] = [
      "KRAKEN",
      "TRADING212",
      "BINANCE",
      "BYBIT",
      "BYBIT_EU",
      "WALLET_ETH",
      "WALLET_SOL",
    ];
    if (!validProviders.includes(provider as ExchangeProvider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    const isWallet = isWalletProvider(provider as ExchangeProvider);

    // Validate required fields per provider type
    if (isWallet && !walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required for wallet providers" },
        { status: 400 }
      );
    }
    if (!isWallet && (!apiKey || !apiSecret)) {
      return NextResponse.json(
        { error: "apiKey and apiSecret are required for exchange providers" },
        { status: 400 }
      );
    }

    // Optionally test the connection before saving
    if (shouldTest) {
      try {
        const client = isWallet
          ? createWalletClient(provider as ExchangeProvider, walletAddress)
          : createExchangeClient(provider as ExchangeProvider, apiKey, apiSecret);
        const testResult = await client.testConnection();
        if (!testResult.success) {
          return NextResponse.json(
            { error: testResult.error || "Connection test failed" },
            { status: 422 }
          );
        }
      } catch (testError) {
        return NextResponse.json(
          {
            error:
              testError instanceof Error
                ? testError.message
                : "Connection test failed",
          },
          { status: 422 }
        );
      }
    }

    // Build data — wallets store address, exchanges store encrypted credentials
    let encryptedApiKey: string | null = null;
    let encryptedApiSecret: string | null = null;
    let encryptionIV: string | null = null;
    let encryptionTag: string | null = null;

    if (!isWallet) {
      const payload = JSON.stringify({ apiKey, apiSecret });
      const encrypted = encrypt(payload);
      encryptedApiKey = encrypted.ciphertext;
      encryptedApiSecret = "";
      encryptionIV = encrypted.iv;
      encryptionTag = encrypted.tag;
    }

    const connection = await prisma.exchangeConnection.create({
      data: {
        workspaceId: workspace.id,
        provider: provider as ExchangeProvider,
        label,
        walletAddress: isWallet ? walletAddress : null,
        encryptedApiKey,
        encryptedApiSecret,
        encryptionIV,
        encryptionTag,
        syncStatus: "IDLE",
        isActive: true,
      },
      select: {
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
        _count: {
          select: { assets: true },
        },
      },
    });

    const serialized = {
      ...connection,
      freeCash: connection.freeCash !== null ? Number(connection.freeCash) : null,
    };

    return NextResponse.json({ connection: serialized }, { status: 201 });
  } catch (error) {
    console.error("Create exchange connection error:", error);
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      return NextResponse.json(
        { error: "An exchange connection with this provider and label already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create exchange connection" },
      { status: 500 }
    );
  }
}
