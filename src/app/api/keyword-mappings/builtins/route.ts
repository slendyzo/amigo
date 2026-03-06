import { NextResponse } from "next/server";
import { KEYWORD_MAP } from "@/lib/parser";

export async function GET() {
  const builtins = Object.entries(KEYWORD_MAP).map(([keyword, mapping]) => ({
    keyword,
    merchant: mapping.merchant,
    category: mapping.category,
  }));

  return NextResponse.json({ builtins });
}
