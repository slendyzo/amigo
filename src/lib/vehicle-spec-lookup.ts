// Vehicle spec lookup via Z.AI GLM-4.6 (Coding Plan endpoint).
//
// Given a free-text vehicle description (e.g. "2018 Mazda MX-5 Miata Sport"),
// returns structured fields the add-vehicle wizard pre-fills:
//   - originalMsrpEur (best-effort, optional)
//   - fuelType, bodyType (enums matching the schema)
//   - generation (e.g. "ND" for the 4th-gen Miata)
//   - imageHint (an image-search query string)
//
// Returns null on any failure (missing API key, rate limit, network error,
// invalid model output) so callers degrade to manual entry.
//
// `thinking: { type: "disabled" }` is required — without it GLM-4.6 burns the
// output budget on reasoning tokens before emitting tool args, and tool calls
// come back truncated or empty.

const ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const MODEL = "glm-4.6";

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

const SYSTEM_PROMPT = `You are a vehicle spec lookup assistant. Given a brand, model, year, and optional trim, invoke the record_vehicle_spec tool with your best estimate of the original MSRP in EUR (when new), fuel type, body type, manufacturer generation code (e.g. "ND" for 4th-gen Mazda MX-5), and an image search query that would surface a clean press photo of the model.

Be honest about uncertainty: if you don't know the MSRP for a specific market or trim, set it to null. Use European pricing (EUR, when-new) where possible. Prefer the manufacturer's standardized generation code when one exists.

Always invoke the tool — never reply with prose.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "record_vehicle_spec",
    description: "Record the vehicle specs derived from the user's input.",
    parameters: {
      type: "object" as const,
      properties: {
        originalMsrpEur: {
          type: ["number", "null"],
          description: "Original MSRP in EUR when the vehicle was new. Null if unknown.",
        },
        fuelType: {
          type: "string",
          enum: [...FUEL_TYPES],
          description: "Engine type. Use HYBRID for plug-in or full hybrid, EV for fully electric.",
        },
        bodyType: {
          type: "string",
          enum: [...BODY_TYPES],
          description: "Body shape. Use OTHER if it doesn't fit cleanly.",
        },
        generation: {
          type: ["string", "null"],
          description:
            "Manufacturer generation code (e.g. 'ND' for 4th-gen Miata, 'F30' for BMW 3-series). Null if not standardized.",
        },
        imageHint: {
          type: ["string", "null"],
          description: "Search query that would return a clean front-3/4 press photo of this model.",
        },
      },
      required: ["originalMsrpEur", "fuelType", "bodyType", "generation", "imageHint"],
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

export async function lookupVehicleSpec(
  input: VehicleSpecLookup,
): Promise<VehicleSpecResult | null> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) return null;

  const userText =
    `Brand: ${input.brand}\nModel: ${input.model}\nYear: ${input.year}` +
    (input.trim ? `\nTrim: ${input.trim}` : "");

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
        max_tokens: 512,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: TOOL.function.name } },
      }),
    });

    if (!res.ok) {
      console.error("[vehicle-spec-lookup] Z.AI HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data: ChatCompletionResponse = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;

    const out = JSON.parse(args) as Partial<VehicleSpecResult> & Record<string, unknown>;

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
    console.error("[vehicle-spec-lookup] Z.AI request failed:", err);
    return null;
  }
}
