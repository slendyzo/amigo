import type { ExchangeProvider } from "@prisma/client";
import type { ExchangeClient } from "./types";
import { KrakenClient } from "./kraken";
import { Trading212Client } from "./trading212";
import { BinanceClient } from "./binance";
import { BybitClient } from "./bybit";
import { EthWalletClient } from "./wallet-eth";
import { SolanaWalletClient } from "./wallet-sol";

const WALLET_PROVIDERS = new Set<ExchangeProvider>(["WALLET_ETH", "WALLET_SOL"]);

export function isWalletProvider(provider: ExchangeProvider): boolean {
  return WALLET_PROVIDERS.has(provider);
}

export function createExchangeClient(
  provider: ExchangeProvider,
  apiKey: string,
  apiSecret: string
): ExchangeClient {
  switch (provider) {
    case "KRAKEN":
      return new KrakenClient(apiKey, apiSecret);
    case "TRADING212":
      return new Trading212Client(apiKey, apiSecret);
    case "BINANCE":
      return new BinanceClient(apiKey, apiSecret);
    case "BYBIT":
      return new BybitClient(apiKey, apiSecret);
    case "BYBIT_EU":
      return new BybitClient(apiKey, apiSecret, "https://api.bybit.eu");
    default:
      throw new Error(`Unsupported exchange provider: ${provider}`);
  }
}

export function createWalletClient(
  provider: ExchangeProvider,
  walletAddress: string
): ExchangeClient {
  switch (provider) {
    case "WALLET_ETH":
      return new EthWalletClient(walletAddress);
    case "WALLET_SOL":
      return new SolanaWalletClient(walletAddress);
    default:
      throw new Error(`Unsupported wallet provider: ${provider}`);
  }
}
