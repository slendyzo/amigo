import { ExchangeProvider } from "@prisma/client";

export interface ExchangeClient {
  provider: ExchangeProvider;
  testConnection(): Promise<{ success: boolean; error?: string }>;
  getPositions(): Promise<ExchangePosition[]>;
  getAccountSummary(): Promise<ExchangeAccountSummary>;
  getDeposits(since?: Date): Promise<ExchangeDepositRecord[]>;
  getTradeHistory(since?: Date): Promise<ExchangeTrade[]>;
}

export type PriceStatus = "OK" | "UNAVAILABLE" | "STALE";

export type ExchangePosition = {
  symbol: string;
  name: string;
  assetType: "CRYPTO" | "ETF" | "STOCK" | "CASH";
  quantity: number;
  averageBuyPrice: number;
  currentPrice: number;
  currency: string;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  totalCost: number;
  currentValue: number;

  // Optional cross-cutting fields used by the new sync correctness pipeline.
  // Connectors that don't yet supply them get OK / null / undefined defaults.
  priceStatus?: PriceStatus;
  priceUnavailableReason?: string | null;
  lockedQuantity?: number; // staked / earn / locked portion of the quantity
};

export type ExchangeAccountSummary = {
  totalValue: number;
  totalCost: number;
  unrealizedPnl: number;
  realizedPnl: number;
  freeCash: number;
  currency: string;
};

export type ExchangeDepositRecord = {
  externalId: string;
  amount: number;
  currency: string;
  date: Date;
  status: string;
};

export type ExchangeTrade = {
  externalId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  feeCurrency: string;
  date: Date;
  currency: string;
};
