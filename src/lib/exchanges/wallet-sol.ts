import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";
import {
  getTokenPrices,
  getTokenPriceByContract,
} from "./coingecko";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// ---------------------------------------------------------------------------
// Well-known SPL token mint addresses → { symbol, name }
// ---------------------------------------------------------------------------
const KNOWN_MINTS: Record<string, { symbol: string; name: string }> = {
  So11111111111111111111111111111111111111112: { symbol: "WSOL", name: "Wrapped SOL" },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USD Coin" },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "Tether USD" },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", name: "Lido Staked SOL" },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "mSOL", name: "Marinade Staked SOL" },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP", name: "Jupiter" },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", name: "Bonk" },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF", name: "dogwifhat" },
};

// Stablecoins — skip price lookup, treat price as $1
const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT", "DAI", "BUSD", "USDH", "UXD"]);

// Minimum USD value to include a token position
const MIN_POSITION_USD = 5;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Solana base58 address validation
// A valid Solana address is a base58-encoded 32-byte public key.
// Base58 alphabet excludes 0, O, I, l.
// Length is 32-44 characters.
// ---------------------------------------------------------------------------
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isValidSolanaAddress(address: string): boolean {
  return BASE58_RE.test(address);
}

// ---------------------------------------------------------------------------
// RPC helper
// ---------------------------------------------------------------------------
async function rpcCall<T = unknown>(
  method: string,
  params: unknown[],
  id = 1
): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status} for method ${method}`);
  }

  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`Solana RPC error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

// ---------------------------------------------------------------------------
// SolanaWalletClient
// ---------------------------------------------------------------------------
export class SolanaWalletClient implements ExchangeClient {
  readonly provider = "WALLET_SOL" as const;
  private readonly walletAddress: string;

  constructor(walletAddress: string) {
    this.walletAddress = walletAddress;
  }

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!isValidSolanaAddress(this.walletAddress)) {
      return {
        success: false,
        error: `Invalid Solana address: must be base58-encoded, 32-44 characters`,
      };
    }

    try {
      await rpcCall("getBalance", [this.walletAddress]);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SolanaWallet] testConnection failed:", msg);
      return { success: false, error: msg };
    }
  }

  // -------------------------------------------------------------------------
  // getPositions
  // -------------------------------------------------------------------------
  async getPositions(): Promise<ExchangePosition[]> {
    const positions: ExchangePosition[] = [];

    // 1. Native SOL balance
    let solBalance = 0;
    try {
      const balanceResult = await rpcCall<{ value: number }>(
        "getBalance",
        [this.walletAddress]
      );
      solBalance = (balanceResult?.value ?? 0) / 1e9; // lamports → SOL
    } catch (err) {
      console.error("[SolanaWallet] getBalance failed:", err);
    }

    // 2. SPL token accounts — small delay before next RPC call to avoid rate limits
    await sleep(300);

    let splTokens: Array<{ mint: string; amount: number; decimals: number }> = [];
    try {
      const tokenResult = await rpcCall<{
        value: Array<{
          account: {
            data: {
              parsed: {
                info: {
                  mint: string;
                  tokenAmount: { uiAmount: number | null; decimals: number };
                };
              };
            };
          };
        }>;
      }>("getTokenAccountsByOwner", [
        this.walletAddress,
        { programId: TOKEN_PROGRAM_ID },
        { encoding: "jsonParsed" },
      ]);

      splTokens = (tokenResult?.value ?? [])
        .map((entry) => {
          const info = entry.account?.data?.parsed?.info;
          if (!info) return null;
          return {
            mint: info.mint,
            amount: info.tokenAmount.uiAmount ?? 0,
            decimals: info.tokenAmount.decimals,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null && t.amount > 0);
    } catch (err) {
      console.error(
        "[SolanaWallet] getTokenAccountsByOwner failed — returning SOL only:",
        err
      );
    }

    // 3. Fetch prices
    await sleep(200);

    // SOL price
    let solPriceUsd = 0;
    try {
      const solPrices = await getTokenPrices(["solana"]);
      solPriceUsd = solPrices["solana"]?.usd ?? 0;
    } catch (err) {
      console.error("[SolanaWallet] SOL price fetch failed:", err);
    }

    // SPL token prices — only for tokens with a balance
    const mintAddresses = splTokens
      .map((t) => t.mint)
      .filter((m) => !STABLECOIN_SYMBOLS.has(KNOWN_MINTS[m]?.symbol ?? ""));

    let splPrices: Record<string, { usd: number; eur: number }> = {};
    if (mintAddresses.length > 0) {
      try {
        await sleep(300);
        splPrices = await getTokenPriceByContract("solana", mintAddresses);
      } catch (err) {
        console.error("[SolanaWallet] SPL token prices fetch failed:", err);
      }
    }

    // 4. Build native SOL position
    if (solBalance > 0) {
      const currentValue = solBalance * solPriceUsd;
      if (currentValue >= MIN_POSITION_USD) {
        positions.push({
          symbol: "SOL",
          name: "Solana",
          assetType: "CRYPTO",
          quantity: solBalance,
          averageBuyPrice: 0,
          currentPrice: solPriceUsd,
          currency: "USD",
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          totalCost: 0,
          currentValue,
        });
      }
    }

    // 5. Build SPL token positions
    for (const token of splTokens) {
      const meta = KNOWN_MINTS[token.mint];
      const symbol = meta?.symbol ?? token.mint.slice(0, 6) + "...";
      const name = meta?.name ?? symbol;
      const isStable = STABLECOIN_SYMBOLS.has(symbol);

      let priceUsd = 0;
      if (isStable) {
        priceUsd = 1;
      } else {
        // CoinGecko returns keys as lowercase contract addresses
        const priceEntry =
          splPrices[token.mint.toLowerCase()] ??
          splPrices[token.mint];
        priceUsd = priceEntry?.usd ?? 0;
      }

      const currentValue = token.amount * priceUsd;
      if (currentValue < MIN_POSITION_USD) continue;

      positions.push({
        symbol,
        name,
        assetType: "CRYPTO",
        quantity: token.amount,
        averageBuyPrice: 0,
        currentPrice: priceUsd,
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
  // getDeposits — not available for wallet clients
  // -------------------------------------------------------------------------
  async getDeposits(_since?: Date): Promise<ExchangeDepositRecord[]> {
    return [];
  }

  // -------------------------------------------------------------------------
  // getTradeHistory — not available for wallet clients
  // -------------------------------------------------------------------------
  async getTradeHistory(_since?: Date): Promise<ExchangeTrade[]> {
    return [];
  }
}
