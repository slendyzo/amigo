import type {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";
import { getTokenPrices, getTokenPriceByContract } from "./coingecko";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ETH_RPC = "https://eth.llamarpc.com";
const ANKR_MULTICHAIN = "https://rpc.ankr.com/multichain";

// Minimum USD value to include a token position
const MIN_POSITION_USD = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate a checksummed or lowercase Ethereum address. */
function isValidEthAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Convert hex wei string (e.g. "0x1a2b3c") to ETH (number). */
function hexWeiToEth(hexWei: string): number {
  return Number(BigInt(hexWei)) / 1e18;
}

// ---------------------------------------------------------------------------
// Ankr response types
// ---------------------------------------------------------------------------

interface AnkrTokenAsset {
  contractAddress?: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenType: string; // "NATIVE" | "ERC20" | ...
  holderAddress: string;
  balance: string;
  balanceRawInteger: string;
  balanceUsd: string;
  tokenPrice: string;
  thumbnail?: string;
  blockchain: string;
}

interface AnkrBalanceResult {
  assets?: AnkrTokenAsset[];
}

// ---------------------------------------------------------------------------
// ETH Wallet client
// ---------------------------------------------------------------------------

export class EthWalletClient implements ExchangeClient {
  readonly provider = "WALLET_ETH" as const;
  private readonly walletAddress: string;

  constructor(walletAddress: string) {
    this.walletAddress = walletAddress.toLowerCase();
  }

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!isValidEthAddress(this.walletAddress)) {
      return {
        success: false,
        error: `Invalid Ethereum address: "${this.walletAddress}". Must start with 0x and be 42 hex characters.`,
      };
    }

    try {
      const res = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [this.walletAddress, "latest"],
          id: 1,
        }),
      });

      if (!res.ok) {
        return { success: false, error: `RPC HTTP error: ${res.status}` };
      }

      const json = (await res.json()) as { result?: string; error?: { message: string } };

      if (json.error) {
        return { success: false, error: json.error.message };
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  // -------------------------------------------------------------------------
  // getPositions
  // -------------------------------------------------------------------------
  async getPositions(): Promise<ExchangePosition[]> {
    // 1. Get native ETH price from CoinGecko
    const ethPrices = await getTokenPrices(["ethereum"]);
    const ethUsdPrice = ethPrices["ethereum"]?.usd ?? 0;

    // 2. Fetch all balances via Ankr multichain API
    let ankrAssets: AnkrTokenAsset[] = [];
    let ankrFailed = false;

    try {
      const ankrRes = await fetch(ANKR_MULTICHAIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "ankr_getAccountBalance",
          params: {
            blockchain: ["eth"],
            walletAddress: this.walletAddress,
            onlyWhitelisted: true,
          },
          id: 1,
        }),
      });

      if (ankrRes.ok) {
        const ankrJson = (await ankrRes.json()) as {
          result?: AnkrBalanceResult;
          error?: { message: string };
        };

        if (ankrJson.result?.assets) {
          ankrAssets = ankrJson.result.assets;
        }
      } else {
        ankrFailed = true;
      }
    } catch {
      ankrFailed = true;
    }

    // 3. If Ankr failed, fall back to native ETH via direct RPC call
    if (ankrFailed || ankrAssets.length === 0) {
      return await this.buildNativeEthPositionOnly(ethUsdPrice);
    }

    // 4. Build positions from Ankr data
    const positions: ExchangePosition[] = [];

    // Collect ERC-20 contract addresses for potential price enrichment
    const erc20Contracts: string[] = ankrAssets
      .filter(
        (a) => a.tokenType !== "NATIVE" && a.contractAddress
      )
      .map((a) => a.contractAddress!.toLowerCase());

    // Attempt to enrich ERC-20 prices via CoinGecko contract lookup
    let contractPrices: Record<string, { usd: number; eur: number }> = {};
    if (erc20Contracts.length > 0) {
      try {
        contractPrices = await getTokenPriceByContract("ethereum", erc20Contracts);
      } catch {
        // Non-fatal — we'll fall back to Ankr's USD price
      }
    }

    for (const asset of ankrAssets) {
      const balanceUsd = Number(asset.balanceUsd ?? 0);

      // Filter out dust positions
      if (balanceUsd < MIN_POSITION_USD) continue;

      const symbol = asset.tokenSymbol.toUpperCase();
      const name = asset.tokenName || symbol;
      const quantity = Number(asset.balance ?? 0);

      // Determine current price: prefer CoinGecko contract price, fall back to Ankr's tokenPrice
      let currentPrice = Number(asset.tokenPrice ?? 0);
      if (asset.tokenType !== "NATIVE" && asset.contractAddress) {
        const cgPrice = contractPrices[asset.contractAddress.toLowerCase()];
        if (cgPrice && cgPrice.usd > 0) {
          currentPrice = cgPrice.usd;
        }
      } else if (asset.tokenType === "NATIVE") {
        // Always use CoinGecko for ETH price
        if (ethUsdPrice > 0) currentPrice = ethUsdPrice;
      }

      const currentValue = quantity * currentPrice;

      positions.push({
        symbol,
        name,
        assetType: "CRYPTO",
        quantity,
        averageBuyPrice: 0,
        currentPrice,
        currency: "USD",
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        totalCost: 0,
        currentValue,
      });
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // Fallback: native ETH only via direct JSON-RPC
  // -------------------------------------------------------------------------
  private async buildNativeEthPositionOnly(
    ethUsdPrice: number
  ): Promise<ExchangePosition[]> {
    try {
      const res = await fetch(ETH_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [this.walletAddress, "latest"],
          id: 1,
        }),
      });

      if (!res.ok) return [];

      const json = (await res.json()) as { result?: string };
      if (!json.result) return [];

      const ethBalance = hexWeiToEth(json.result);
      const currentValue = ethBalance * ethUsdPrice;

      if (currentValue < MIN_POSITION_USD) return [];

      return [
        {
          symbol: "ETH",
          name: "Ethereum",
          assetType: "CRYPTO",
          quantity: ethBalance,
          averageBuyPrice: 0,
          currentPrice: ethUsdPrice,
          currency: "USD",
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          totalCost: 0,
          currentValue,
        },
      ];
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // getAccountSummary
  // -------------------------------------------------------------------------
  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    const positions = await this.getPositions();

    const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);

    return {
      totalValue,
      totalCost: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      freeCash: 0,
      currency: "USD",
    };
  }

  // -------------------------------------------------------------------------
  // getDeposits — not applicable for public wallet reads
  // -------------------------------------------------------------------------
  async getDeposits(_since?: Date): Promise<ExchangeDepositRecord[]> {
    return [];
  }

  // -------------------------------------------------------------------------
  // getTradeHistory — not applicable for public wallet reads
  // -------------------------------------------------------------------------
  async getTradeHistory(_since?: Date): Promise<ExchangeTrade[]> {
    return [];
  }
}
