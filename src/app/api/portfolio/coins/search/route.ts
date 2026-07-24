import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { searchCoins } from "@/lib/exchanges/coingecko";

// GET - Search CoinGecko for a coin to attach a manual holding to.
// Powers the asset picker; results carry a live price so the user can confirm
// they matched the token they meant before saving.
export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";

    if (query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchCoins(query);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Coin search error:", error);
    // An empty list degrades the picker gracefully; a 500 would break the form.
    return NextResponse.json({ results: [] });
  }
}
