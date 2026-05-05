/**
 * Prompt builder and validator for the "categorize untagged expenses" nudge.
 *
 * No external deps — hand-rolled validator satisfies SchemaLike<T> from glm.ts.
 */

import type { GlmTool, SchemaLike } from "@/lib/glm";

// ── Output type ───────────────────────────────────────────────────────────────

export type CategorizeGuess = {
  id: string;
  categoryId: string | null;
  confidence: "high" | "medium" | "low";
};

export type CategorizeOutput = {
  guesses: CategorizeGuess[];
};

// ── Hand-rolled validator ─────────────────────────────────────────────────────

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

const categorizeSchema: SchemaLike<CategorizeOutput> = {
  parse(data: unknown): CategorizeOutput {
    if (typeof data !== "object" || data === null) {
      throw new Error("[nudge-categorize] Root must be an object");
    }
    const d = data as Record<string, unknown>;
    if (!Array.isArray(d.guesses)) {
      throw new Error("[nudge-categorize] guesses must be an array");
    }
    const guesses: CategorizeGuess[] = [];
    for (let i = 0; i < d.guesses.length; i++) {
      const g = d.guesses[i];
      if (typeof g !== "object" || g === null) {
        throw new Error(`[nudge-categorize] guesses[${i}] must be an object`);
      }
      const obj = g as Record<string, unknown>;
      if (typeof obj.id !== "string") {
        throw new Error(`[nudge-categorize] guesses[${i}].id must be a string`);
      }
      if (obj.categoryId !== null && typeof obj.categoryId !== "string") {
        throw new Error(`[nudge-categorize] guesses[${i}].categoryId must be string or null`);
      }
      if (!VALID_CONFIDENCE.has(obj.confidence as string)) {
        throw new Error(`[nudge-categorize] guesses[${i}].confidence must be high|medium|low`);
      }
      guesses.push({
        id: obj.id as string,
        categoryId: (obj.categoryId as string | null) ?? null,
        confidence: obj.confidence as "high" | "medium" | "low",
      });
    }
    return { guesses };
  },
};

// ── Tool definition ───────────────────────────────────────────────────────────

const categorizeTool: GlmTool = {
  type: "function",
  function: {
    name: "record_category_guesses",
    description:
      "Record a category guess for each uncategorized expense. Use categoryId=null if no match is plausible.",
    parameters: {
      type: "object",
      required: ["guesses"],
      additionalProperties: false,
      properties: {
        guesses: {
          type: "array",
          description: "One entry per expense.",
          items: {
            type: "object",
            required: ["id", "categoryId", "confidence"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: "The expense id from the input payload.",
              },
              categoryId: {
                type: ["string", "null"],
                description:
                  "The id of the matched category from the provided list, or null if no match is plausible.",
              },
              confidence: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "How unambiguous the match is.",
              },
            },
          },
        },
      },
    },
  },
};

// ── System prompt extra ───────────────────────────────────────────────────────

const SYSTEM_PROMPT_EXTRA =
  "Match each expense to its most likely category from the provided list. Return categoryId=null if no match is plausible. Confidence is your judgment of how unambiguous the match is. Don't invent categories — only use ids from the provided list.";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildCategorizePrompt(opts: {
  expenses: Array<{ id: string; name: string; amount: number }>;
  categories: Array<{ id: string; name: string }>;
}): {
  systemPromptExtra: string;
  userMessage: string;
  tool: GlmTool;
  schema: SchemaLike<CategorizeOutput>;
} {
  const userMessage = `Categorize the following expenses.\n\nExpenses:\n${JSON.stringify(opts.expenses, null, 2)}\n\nAvailable categories:\n${JSON.stringify(opts.categories, null, 2)}`;
  return {
    systemPromptExtra: SYSTEM_PROMPT_EXTRA,
    userMessage,
    tool: categorizeTool,
    schema: categorizeSchema,
  };
}
