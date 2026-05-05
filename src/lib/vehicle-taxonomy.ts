// Vehicle taxonomy builder — lazy-cached makes / models / trims for the
// cascading add-vehicle wizard.
//
// First user of a (year, make[, model]) combination triggers a Z.AI GLM-4.6
// call; the result is persisted in `vehicle_taxonomy` and every subsequent
// caller hits the cache for free.
//
// The trim level is the one that fixes the original bug — when a user picks
// "2019 Mazda MX-5", we MUST surface RF (retractable hardtop) and Soft Top
// as distinct options so the chart never shows soft-top comparables for an
// RF and vice-versa. The system prompt enforces this.

import { prisma } from "./db";

const ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const MODEL = "glm-4.6";

export type TaxonomyLevel = "makes" | "models" | "trims";

const SOURCE = "ai_glm_4_6";

// Static list of vehicle makes sold (new or via authorised import) in the
// Portuguese market. The set is essentially year-invariant — using an LLM
// per-year for this was wasteful and rate-limit-prone. Models and trims still
// vary by year and stay AI-driven.
const MAKES_PT: readonly string[] = [
  "Abarth",
  "Alfa Romeo",
  "Alpine",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "BYD",
  "Chery",
  "Chevrolet",
  "Citroën",
  "Cupra",
  "Dacia",
  "DS",
  "Ferrari",
  "Fiat",
  "Ford",
  "Genesis",
  "Honda",
  "Hyundai",
  "Infiniti",
  "Isuzu",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Lancia",
  "Land Rover",
  "Lexus",
  "Lotus",
  "Lynk & Co",
  "Maserati",
  "Maxus",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "MG",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Opel",
  "Peugeot",
  "Polestar",
  "Porsche",
  "Renault",
  "Rolls-Royce",
  "Saab",
  "SEAT",
  "Skoda",
  "Smart",
  "Ssangyong",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "XPeng",
];

// In-memory dedupe of concurrent cache misses. Keyed by `{level}|{parentKey}`.
// The window is short — only the time between cache miss and DB write — but
// long enough that two near-simultaneous wizard openings don't both pay for
// the AI call.
const inflight = new Map<string, Promise<string[]>>();

function inflightKey(level: TaxonomyLevel, parentKey: string): string {
  return `${level}|${parentKey}`;
}

const SYSTEM_PROMPT_BASE = `You are a vehicle catalog assistant for the Portuguese market. You return clean, deduplicated lists of vehicle makes, models, or trims — one list at a time — by invoking the record_taxonomy tool.

Hard rules:
- Bias the list toward what was actually sold in Portugal / mainland Europe in the requested year. No US-only nameplates, no JDM-only trims.
- Sort entries alphabetically (case-insensitive).
- Use the manufacturer's canonical naming (e.g. "MX-5" not "MX5", "C-Class" not "Cclass", "X3" not "x3").
- No duplicates, no empty strings, no surrounding whitespace.
- Be reasonably comprehensive — better to include a niche option than to omit a common one — but cap each list at 60 entries to keep dropdowns usable.

Always invoke the record_taxonomy tool. Never reply with prose.`;

const PROMPT_BY_LEVEL: Record<Exclude<TaxonomyLevel, "makes">, (parts: string[]) => string> = {
  models: ([year, make]) =>
    `List MODELS that ${make} sold new in Portugal in model year ${year}. Use the canonical European model name (e.g. for BMW: "1 Series", "3 Series", "X1", "M2", "i4"; for Mazda: "2", "3", "6", "MX-5", "CX-3", "CX-5", "CX-30"). Do NOT include trim levels yet — that's a separate step.`,
  trims: ([year, make, model]) =>
    `List TRIMS / variants of the ${year} ${make} ${model} as it was sold in Portugal. CRITICAL: include body-style and roof variants as DISTINCT entries (e.g. for Mazda MX-5: "RF" and "Soft Top" must be separate items, NOT collapsed; for Porsche 911: "Coupe" and "Cabriolet"; for BMW 4 Series: "Coupé", "Convertible", "Gran Coupé"). Also include named special editions where they are commercially distinct (e.g. "GT Sport Tech", "Sport Black", "M Sport"). Use the trim labels Portuguese buyers would recognize on a Standvirtual listing. If the model has no meaningful trim segmentation, return a single entry "Base".`,
};

const TOOL = {
  type: "function" as const,
  function: {
    name: "record_taxonomy",
    description: "Record the requested list of vehicle makes, models, or trims.",
    parameters: {
      type: "object" as const,
      properties: {
        values: {
          type: "array",
          description:
            "Alphabetically sorted, deduplicated list of canonical entries. No empty strings.",
          items: { type: "string" },
          maxItems: 60,
          minItems: 1,
        },
      },
      required: ["values"],
    },
  },
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
};

export async function fetchTaxonomyLevel(
  level: TaxonomyLevel,
  parentKey: string,
): Promise<string[]> {
  // Makes never go through the AI / cache path — they're a stable static list.
  if (level === "makes") return [...MAKES_PT];

  // 1. Cache hit?
  const cached = await prisma.vehicleTaxonomy.findUnique({
    where: { level_parentKey: { level, parentKey } },
  });
  if (cached) {
    const values = cached.values as unknown;
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string") : [];
  }

  // 2. Concurrent cache miss? Reuse the in-flight promise.
  const key = inflightKey(level, parentKey);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string[]> => {
    try {
      const values = await callZAI(level, parentKey);
      if (values.length === 0) return [];

      // Upsert (not create) so a second writer that beat us to it doesn't 409.
      await prisma.vehicleTaxonomy.upsert({
        where: { level_parentKey: { level, parentKey } },
        create: { level, parentKey, values, source: SOURCE },
        update: { values, source: SOURCE },
      });

      return values;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

async function callZAI(level: TaxonomyLevel, parentKey: string): Promise<string[]> {
  if (level === "makes") return [...MAKES_PT]; // defensive — fetchTaxonomyLevel short-circuits first

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.warn("[vehicle-taxonomy] ZAI_API_KEY missing — returning empty list");
    return [];
  }

  const parts = parentKey.split("|");
  const userText = PROMPT_BY_LEVEL[level](parts);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: "disabled" },
        max_tokens: 2048,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_BASE },
          { role: "user", content: userText },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: TOOL.function.name } },
      }),
    });

    if (!res.ok) {
      console.error(
        "[vehicle-taxonomy] Z.AI HTTP",
        res.status,
        await res.text().catch(() => ""),
      );
      return [];
    }

    const data: ChatCompletionResponse = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return [];

    const parsed = JSON.parse(args) as { values?: unknown };
    if (!Array.isArray(parsed.values)) return [];

    const cleaned = parsed.values
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    // Dedupe case-insensitively, preserving the first-seen casing.
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const v of cleaned) {
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(v);
    }

    deduped.sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
    return deduped.slice(0, 60);
  } catch (err) {
    console.error("[vehicle-taxonomy] Z.AI request failed:", err);
    return [];
  }
}

// Helpers used by the API route to validate query params and build parentKey.
export function parseTaxonomyRequest(searchParams: URLSearchParams): {
  level: TaxonomyLevel;
  parentKey: string;
} | { error: string } {
  const yearRaw = searchParams.get("year");
  const make = searchParams.get("make")?.trim() || null;
  const model = searchParams.get("model")?.trim() || null;

  if (!yearRaw) return { error: "year is required" };
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    return { error: "year must be a valid 4-digit year" };
  }

  if (!make) {
    return { level: "makes", parentKey: String(year) };
  }
  if (!model) {
    return { level: "models", parentKey: `${year}|${make}` };
  }
  return { level: "trims", parentKey: `${year}|${make}|${model}` };
}
