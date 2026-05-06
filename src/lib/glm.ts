// Reusable GLM-4.6 wrapper for AI Advisor structured-output calls.
//
// Matches Z.ai conventions from vehicle-spec-lookup.ts:
//   - Endpoint + model are identical
//   - `thinking: { type: "disabled" }` is required (prevents truncated tool args)
//   - Returns null on HTTP/network failure; throws on schema parse failure
//
// Note: zod is not installed in this project. `SchemaLike<T>` is a minimal
// duck-type interface matching zod's .parse() / .safeParse() shape so callers
// can pass a hand-rolled validator or a zod schema if zod is ever added later.

import { checkRateLimit } from "./glm-rate-limit";

const ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const MODEL = "glm-4.6";

// ── Types ──────────────────────────────────────────────────────────────────

export type GlmTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// Minimal duck-type for a zod-like schema validator.
// Compatible with zod's ZodSchema if zod is added later.
export type SchemaLike<T> = {
  parse(data: unknown): T;
};

export class RateLimitError extends Error {
  constructor(
    public readonly userId: string,
    public readonly bucket: "live" | "cron",
    public readonly resetAt: number,
  ) {
    super(`[glm] Rate limit exceeded for user ${userId} (bucket: ${bucket})`);
    this.name = "RateLimitError";
  }
}

export class InsightParseError extends Error {
  constructor(
    public readonly cause: unknown,
    public readonly raw: string,
  ) {
    super(`[glm] Schema validation failed`);
    this.name = "InsightParseError";
  }
}

// ── Locale helpers ─────────────────────────────────────────────────────────

const LOCALE_NAMES: Record<string, string> = {
  "en-GB": "English (UK)",
  "pt-PT": "European Portuguese (Portugal)",
  "fr-FR": "French (France)",
};

// Positive locale guidance — concrete forms to USE rather than negations.
// LLMs follow positive constraints more reliably than "do not X", especially
// for dialect-sensitive locales (pt-PT vs pt-BR is the load-bearing one here).
const LOCALE_GUIDE: Record<string, string> = {
  "en-GB":
    "Plain, sober register. British spellings (organise, optimisation, colour). Avoid intensifiers like 'really' or 'very'.",
  "pt-PT":
    "Use português europeu de Portugal: 'estou a fazer' (não 'estou fazendo'); 'utilizador' (não 'usuário'); 'fatura' (não 'nota fiscal'); 'subscrição' (não 'assinatura'); 'autocarro' (não 'ônibus'); 'comboio' (não 'trem'). Vocabulário financeiro: 'despesas', 'orçamento', 'recorrente', 'comerciante', 'aceites' (não 'aceitos'). Registo impessoal — evite 'você'; prefira formas sem pronome ('gastou X em Y') ou impessoais ('os gastos foram...').",
  "fr-FR":
    "Français standard de France. Adressez-vous au 'vous' formel. Vocabulaire financier : 'dépenses', 'budget', 'récurrent', 'catégorie', 'commerçant', 'mensuel'. Registre factuel et sobre, sans exclamations ni superlatifs.",
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

// ── Main export ────────────────────────────────────────────────────────────

export async function generateInsight<T>(opts: {
  userId: string;
  bucket: "live" | "cron";
  promptType: string;
  locale: "en-GB" | "pt-PT" | "fr-FR";
  systemPromptExtra?: string;
  userMessage: string;
  tool: GlmTool;
  schema: SchemaLike<T>;
  maxTokens?: number;
}): Promise<T | null> {
  const {
    userId,
    bucket,
    locale,
    systemPromptExtra,
    userMessage,
    tool,
    schema,
    maxTokens = 1024,
  } = opts;

  // Rate limit check
  const rl = checkRateLimit(userId, bucket);
  if (!rl.allowed) {
    throw new RateLimitError(userId, bucket, rl.resetAt);
  }

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.error("[glm] ZAI_API_KEY is not set");
    return null;
  }

  const localeName = LOCALE_NAMES[locale] ?? locale;
  const localeGuide = LOCALE_GUIDE[locale] ?? "";
  const baseSystem = [
    "You are a sharp, dry analyst. Numbers-first. No moralising, no encouragement, no celebrations.",
    "Output zero emoji characters — if you are about to output an emoji, output nothing in its place.",
    `Respond in ${localeName}.`,
    localeGuide,
  ]
    .filter(Boolean)
    .join("\n\n");
  const systemPrompt = systemPromptExtra
    ? `${baseSystem}\n\n${systemPromptExtra}`
    : baseSystem;

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
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    });

    if (!res.ok) {
      console.error("[glm]", res.status, await res.text().catch(() => ""));
      return null;
    }

    const data: ChatCompletionResponse = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.error("[glm] No tool_calls arguments in response");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch (err) {
      throw new InsightParseError(err, args);
    }

    try {
      return schema.parse(parsed);
    } catch (err) {
      throw new InsightParseError(err, args);
    }
  } catch (err) {
    if (err instanceof InsightParseError) throw err;
    console.error("[glm] Z.ai request failed:", err);
    return null;
  }
}
