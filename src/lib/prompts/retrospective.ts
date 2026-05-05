/**
 * Prompt builder and validator for the monthly retrospective insight.
 *
 * No external deps — hand-rolled validator satisfies SchemaLike<T> from glm.ts.
 */

import type { GlmTool, SchemaLike } from "@/lib/glm";
import type { MonthAggregate } from "@/lib/insight-aggregator";

// Re-export so the route can import the payload type from one place.
export type { MonthAggregate };

// ── Output type ───────────────────────────────────────────────────────────────

export type RetrospectiveOutput = {
  headline: string;
  observations: [string, string, string];
  momHighlights: Array<{
    category: string;
    currentTotal: number;
    prevTotal: number;
    pctChange: number;
  }>;
};

// ── Hand-rolled validator ─────────────────────────────────────────────────────

function assertString(val: unknown, path: string): asserts val is string {
  if (typeof val !== "string") {
    throw new Error(`[retrospective] Expected string at ${path}, got ${typeof val}`);
  }
}

function assertNumber(val: unknown, path: string): asserts val is number {
  if (typeof val !== "number") {
    throw new Error(`[retrospective] Expected number at ${path}, got ${typeof val}`);
  }
}

const retrospectiveSchema: SchemaLike<RetrospectiveOutput> = {
  parse(data: unknown): RetrospectiveOutput {
    if (typeof data !== "object" || data === null) {
      throw new Error("[retrospective] Root must be an object");
    }

    const d = data as Record<string, unknown>;

    // headline
    assertString(d.headline, "headline");
    if (d.headline.length > 90) {
      throw new Error(`[retrospective] headline exceeds 90 chars (${d.headline.length})`);
    }

    // observations: array of exactly 3 strings, each ≤ 140 chars
    if (!Array.isArray(d.observations) || d.observations.length !== 3) {
      throw new Error(
        `[retrospective] observations must be an array of exactly 3 strings, got ${Array.isArray(d.observations) ? d.observations.length : typeof d.observations}`
      );
    }
    for (let i = 0; i < 3; i++) {
      assertString(d.observations[i], `observations[${i}]`);
      if ((d.observations[i] as string).length > 140) {
        throw new Error(
          `[retrospective] observations[${i}] exceeds 140 chars (${(d.observations[i] as string).length})`
        );
      }
    }

    // momHighlights: array of 3-5 objects
    if (!Array.isArray(d.momHighlights)) {
      throw new Error("[retrospective] momHighlights must be an array");
    }
    if (d.momHighlights.length < 3 || d.momHighlights.length > 5) {
      throw new Error(
        `[retrospective] momHighlights must have 3-5 entries, got ${d.momHighlights.length}`
      );
    }
    const momHighlights: RetrospectiveOutput["momHighlights"] = [];
    for (let i = 0; i < d.momHighlights.length; i++) {
      const h = d.momHighlights[i];
      if (typeof h !== "object" || h === null) {
        throw new Error(`[retrospective] momHighlights[${i}] must be an object`);
      }
      const hObj = h as Record<string, unknown>;
      assertString(hObj.category, `momHighlights[${i}].category`);
      assertNumber(hObj.currentTotal, `momHighlights[${i}].currentTotal`);
      assertNumber(hObj.prevTotal, `momHighlights[${i}].prevTotal`);
      assertNumber(hObj.pctChange, `momHighlights[${i}].pctChange`);
      momHighlights.push({
        category: hObj.category as string,
        currentTotal: hObj.currentTotal as number,
        prevTotal: hObj.prevTotal as number,
        pctChange: hObj.pctChange as number,
      });
    }

    return {
      headline: d.headline as string,
      observations: d.observations as [string, string, string],
      momHighlights,
    };
  },
};

// ── Tool definition ───────────────────────────────────────────────────────────

const retrospectiveTool: GlmTool = {
  type: "function",
  function: {
    name: "record_retrospective",
    description:
      "Record a structured monthly spending retrospective for display in the Amigo app.",
    parameters: {
      type: "object",
      required: ["headline", "observations", "momHighlights"],
      additionalProperties: false,
      properties: {
        headline: {
          type: "string",
          maxLength: 90,
          description:
            "One short, factual statement summarising the month (max 90 chars).",
        },
        observations: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          description: "Exactly 3 factual observations, each max 140 chars.",
          items: {
            type: "string",
            maxLength: 140,
          },
        },
        momHighlights: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          description:
            "3 to 5 month-over-month category comparisons. Only include categories with meaningful data.",
          items: {
            type: "object",
            required: ["category", "currentTotal", "prevTotal", "pctChange"],
            additionalProperties: false,
            properties: {
              category: { type: "string", description: "Category name." },
              currentTotal: {
                type: "number",
                description: "Total spent in the current month (EUR).",
              },
              prevTotal: {
                type: "number",
                description: "Total spent in the previous month (EUR).",
              },
              pctChange: {
                type: "number",
                description:
                  "Percentage change vs previous month. Positive = increase.",
              },
            },
          },
        },
      },
    },
  },
};

// ── System prompt extra ───────────────────────────────────────────────────────

const SYSTEM_PROMPT_EXTRA = `Generate a retrospective summary for the given month. The output is a UI popup that the user reads in 30 seconds. Headline is one short, factual statement (e.g. "October was your highest dining month in six months"). Each observation is one short factual sentence — no advice, no judgment, no exclamation marks, no emojis, no second-person scolding ("you spent too much..."). Numbers are pre-computed in the payload — quote them, don't re-derive. Pick observations that surface NON-OBVIOUS patterns from the data, not repetitions of the headline.`;

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildRetrospectivePrompt(opts: {
  locale: "en-GB" | "pt-PT" | "fr-FR";
  monthName: string;
  year: number;
  payload: MonthAggregate;
}): {
  systemPromptExtra: string;
  userMessage: string;
  tool: GlmTool;
  schema: SchemaLike<RetrospectiveOutput>;
} {
  const { monthName, year, payload } = opts;

  const userMessage = `Retrospective for ${monthName} ${year}\n\n${JSON.stringify(payload, null, 2)}`;

  return {
    systemPromptExtra: SYSTEM_PROMPT_EXTRA,
    userMessage,
    tool: retrospectiveTool,
    schema: retrospectiveSchema,
  };
}
