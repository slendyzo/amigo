import type { ExchangeProvider } from "@prisma/client";
import type { ExchangeClient } from "./types";
import { KrakenClient } from "./kraken";
import { Trading212Client } from "./trading212";

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
    default:
      throw new Error(`Unsupported exchange provider: ${provider}`);
  }
}
