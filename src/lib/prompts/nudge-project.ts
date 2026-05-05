/**
 * Prompt builder and hand-rolled validator for the project-cluster nudge.
 *
 * No external deps — SchemaLike<T> from glm.ts.
 */

import type { GlmTool, SchemaLike } from "@/lib/glm";

// ── Output type ───────────────────────────────────────────────────────────────

export type ProjectClusterOutput = {
  clusters: Array<{
    theme: string;
    expenseIds: string[];
    suggestedProjectName: string;
  }>;
};

// ── Hand-rolled validator ─────────────────────────────────────────────────────

const projectClusterSchema: SchemaLike<ProjectClusterOutput> = {
  parse(data: unknown): ProjectClusterOutput {
    if (typeof data !== "object" || data === null) {
      throw new Error("[nudge-project] Root must be an object");
    }

    const d = data as Record<string, unknown>;

    if (!Array.isArray(d.clusters)) {
      throw new Error("[nudge-project] clusters must be an array");
    }

    const validClusters: ProjectClusterOutput["clusters"] = [];

    for (let i = 0; i < d.clusters.length; i++) {
      const c = d.clusters[i];
      if (typeof c !== "object" || c === null) continue;

      const cObj = c as Record<string, unknown>;

      if (typeof cObj.theme !== "string" || !cObj.theme) continue;
      if (typeof cObj.suggestedProjectName !== "string" || !cObj.suggestedProjectName) continue;
      if (!Array.isArray(cObj.expenseIds)) continue;
      if (cObj.expenseIds.length < 3) continue;
      if (!cObj.expenseIds.every((id: unknown) => typeof id === "string")) continue;

      validClusters.push({
        theme: (cObj.theme as string).slice(0, 30),
        expenseIds: cObj.expenseIds as string[],
        suggestedProjectName: (cObj.suggestedProjectName as string).slice(0, 40),
      });
    }

    return { clusters: validClusters };
  },
};

// ── Tool definition ───────────────────────────────────────────────────────────

const nudgeProjectTool: GlmTool = {
  type: "function",
  function: {
    name: "record_clusters",
    description:
      "Record semantic expense clusters that should be tagged with a project in the Amigo app.",
    parameters: {
      type: "object",
      required: ["clusters"],
      additionalProperties: false,
      properties: {
        clusters: {
          type: "array",
          description: "Semantic clusters of expenses sharing a real-world theme.",
          items: {
            type: "object",
            required: ["theme", "expenseIds", "suggestedProjectName"],
            additionalProperties: false,
            properties: {
              theme: {
                type: "string",
                maxLength: 30,
                description: "Short noun phrase describing the cluster theme (max 30 chars).",
              },
              expenseIds: {
                type: "array",
                minItems: 3,
                description: "IDs of expenses in the cluster. Must all come from the provided list. Minimum 3.",
                items: { type: "string" },
              },
              suggestedProjectName: {
                type: "string",
                maxLength: 40,
                description: "Suggested project tag name a user would recognise (max 40 chars).",
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
  "Identify clusters of 3 or more expenses that clearly share a real-world theme (e.g. construction project, vacation, event, recurring service category). Only group expenses that obviously belong together. Do not force clusters where the connection is weak. Return an empty clusters array if nothing groups cleanly. The theme is a short noun phrase (max 30 chars). suggestedProjectName is what a user would name a project tag for this cluster (max 40 chars). expenseIds must come from the provided list.";

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildNudgeProjectPrompt(opts: {
  expenses: Array<{ id: string; name: string; amount: number; date: string }>;
}): {
  systemPromptExtra: string;
  userMessage: string;
  tool: GlmTool;
  schema: SchemaLike<ProjectClusterOutput>;
} {
  const userMessage = `Expenses to cluster:\n\n${JSON.stringify(opts.expenses, null, 2)}`;

  return {
    systemPromptExtra: SYSTEM_PROMPT_EXTRA,
    userMessage,
    tool: nudgeProjectTool,
    schema: projectClusterSchema,
  };
}
