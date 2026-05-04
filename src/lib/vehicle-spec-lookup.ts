// Vehicle spec lookup via Claude Haiku 4.5.
//
// Given a free-text vehicle description (e.g. "2018 Mazda MX-5 Miata Sport"),
// returns structured fields the add-vehicle wizard pre-fills:
//   - originalMsrpEur (best-effort, optional)
//   - fuelType, bodyType (enums matching the schema)
//   - generation (e.g. "ND" for the 4th-gen Miata)
//   - imageHint (an image-search query string)
//
// Returns null on any failure (missing API key, rate limit, network error,
// invalid model output) so callers degrade to manual entry. Costs ~€0.001/call.
// System prompt is cached to amortize latency + cost across lookups.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

const FUEL_TYPES = ["PETROL", "DIESEL", "HYBRID", "EV", "OTHER"] as const;
const BODY_TYPES = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "WAGON",
  "COUPE",
  "CONVERTIBLE",
  "TRUCK",
  "OTHER",
] as const;

export type VehicleFuelType = (typeof FUEL_TYPES)[number];
export type VehicleBodyType = (typeof BODY_TYPES)[number];

export type VehicleSpecLookup = {
  brand: string;
  model: string;
  year: number;
  trim?: string | null;
};

export type VehicleSpecResult = {
  originalMsrpEur: number | null;
  fuelType: VehicleFuelType | null;
  bodyType: VehicleBodyType | null;
  generation: string | null;
  imageHint: string | null;
};

const SYSTEM_PROMPT = `You are a vehicle spec lookup assistant. Given a brand, model, year, and optional trim, return your best estimate of the original MSRP in EUR (when new), fuel type, body type, generation code (e.g. "ND" for 4th-gen Mazda MX-5), and an image search query that would surface a clean press photo of the model.

Be honest about uncertainty: if you don't know the MSRP for a specific market or trim, omit it. Use European pricing (EUR, when-new) where possible. Prefer the manufacturer's standardized generation code when one exists.

Always respond by calling the record_vehicle_spec tool — never with free-form prose.`;

const TOOL = {
  name: "record_vehicle_spec",
  description: "Record the vehicle specs derived from the user's input.",
  input_schema: {
    type: "object" as const,
    properties: {
      originalMsrpEur: {
        type: ["number", "null"],
        description: "Original MSRP in EUR when the vehicle was new. Null if unknown.",
      },
      fuelType: {
        type: ["string", "null"],
        enum: [...FUEL_TYPES, null],
        description: "Engine type. Use HYBRID for plug-in or full hybrid, EV for fully electric.",
      },
      bodyType: {
        type: ["string", "null"],
        enum: [...BODY_TYPES, null],
        description: "Body shape. Use OTHER if it doesn't fit cleanly.",
      },
      generation: {
        type: ["string", "null"],
        description: "Manufacturer generation code (e.g. 'ND' for 4th-gen Miata, 'F30' for BMW 3-series). Null if not standardized.",
      },
      imageHint: {
        type: ["string", "null"],
        description: "Search query that would return a clean front-3/4 press photo of this model.",
      },
    },
    required: ["originalMsrpEur", "fuelType", "bodyType", "generation", "imageHint"],
  },
};

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

export async function lookupVehicleSpec(input: VehicleSpecLookup): Promise<VehicleSpecResult | null> {
  const c = getClient();
  if (!c) return null;

  const userText =
    `Brand: ${input.brand}\nModel: ${input.model}\nYear: ${input.year}` +
    (input.trim ? `\nTrim: ${input.trim}` : "");

  try {
    const response = await c.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: userText }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return null;

    const out = block.input as Partial<VehicleSpecResult> & Record<string, unknown>;

    const fuelType =
      typeof out.fuelType === "string" && (FUEL_TYPES as readonly string[]).includes(out.fuelType)
        ? (out.fuelType as VehicleFuelType)
        : null;
    const bodyType =
      typeof out.bodyType === "string" && (BODY_TYPES as readonly string[]).includes(out.bodyType)
        ? (out.bodyType as VehicleBodyType)
        : null;

    return {
      originalMsrpEur: typeof out.originalMsrpEur === "number" ? out.originalMsrpEur : null,
      fuelType,
      bodyType,
      generation: typeof out.generation === "string" ? out.generation : null,
      imageHint: typeof out.imageHint === "string" ? out.imageHint : null,
    };
  } catch (err) {
    console.error("[vehicle-spec-lookup] Claude API failed:", err);
    return null;
  }
}
