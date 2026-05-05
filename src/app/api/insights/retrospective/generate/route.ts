/**
 * POST /api/insights/retrospective/generate
 *
 * Cron endpoint — generates RETROSPECTIVE Insight rows for all eligible
 * workspaces for the previous calendar month (or an explicit year+month).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Body (optional): { year?: number, month?: number }
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateMonth } from "@/lib/insight-aggregator";
import { generateInsight, InsightParseError } from "@/lib/glm";
import { buildRetrospectivePrompt } from "@/lib/prompts/retrospective";
import { InsightType, InsightStatus } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

function stableHash(obj: unknown): string {
  // Stable JSON: sort object keys recursively
  const stable = JSON.stringify(obj, (_, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
      : v
  );
  return createHash("sha256").update(stable).digest("hex");
}

function previousMonth(now: Date): { year: number; month: number } {
  const m = now.getUTCMonth(); // 0-indexed
  const y = now.getUTCFullYear();
  return m === 0
    ? { year: y - 1, month: 12 }
    : { year: y, month: m }; // month is already 1-indexed (0-indexed Jan → prev Dec; Feb(1) → 1)
}

const LOCALE_MAP: Record<string, "en-GB" | "pt-PT" | "fr-FR"> = {
  en: "en-GB",
  "pt-PT": "pt-PT",
  "fr-FR": "fr-FR",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function localizedMonthName(
  year: number,
  month: number,
  locale: "en-GB" | "pt-PT" | "fr-FR"
): string {
  const name = new Date(year, month - 1).toLocaleString(locale, {
    month: "long",
  });
  return capitalize(name);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[retrospective-cron] CRON_SECRET is not set — endpoint disabled");
    return NextResponse.json(
      { error: "Service unavailable: CRON_SECRET not configured" },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== cronSecret) {
    console.error("[retrospective-cron] Unauthorized request (bad or missing token)");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let bodyYear: number | undefined;
  let bodyMonth: number | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.year === "number") bodyYear = body.year;
    if (typeof body.month === "number") bodyMonth = body.month;
  } catch {
    // No body is fine
  }

  const now = new Date();
  const prev = previousMonth(now);
  const year = bodyYear ?? prev.year;
  const month = bodyMonth ?? prev.month;

  console.log(`[retrospective-cron] Generating retrospectives for ${year}-${String(month).padStart(2, "0")}`);

  // ── Find eligible workspaces ────────────────────────────────────────────────
  const workspaces = await prisma.workspace.findMany({
    where: {
      members: {
        some: {
          user: { aiProcessingEnabled: true },
        },
      },
    },
    select: { id: true, language: true },
  });

  console.log(`[retrospective-cron] Found ${workspaces.length} eligible workspace(s)`);

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const ws of workspaces) {
    try {
      // ── Cold-start gate ──────────────────────────────────────────────────────
      const totalExpenses = await prisma.expense.count({
        where: { workspaceId: ws.id },
      });

      if (totalExpenses < 30) {
        console.log(
          `[retrospective-cron] ws=${ws.id} skipped: only ${totalExpenses} total expenses (need ≥30)`
        );
        skipped++;
        continue;
      }

      // At least 2 distinct months with expenses
      const monthGroups = await prisma.expense.findMany({
        where: { workspaceId: ws.id },
        select: { date: true },
        distinct: ["date"],
      });

      const distinctMonths = new Set(
        monthGroups.map((e) => {
          const d = new Date(e.date);
          return `${d.getFullYear()}-${d.getMonth()}`;
        })
      );

      if (distinctMonths.size < 2) {
        console.log(
          `[retrospective-cron] ws=${ws.id} skipped: only ${distinctMonths.size} distinct month(s) (need ≥2)`
        );
        skipped++;
        continue;
      }

      // ── Aggregate ────────────────────────────────────────────────────────────
      const payload = await aggregateMonth(ws.id, year, month);

      if (payload.expenseCount === 0) {
        console.log(`[retrospective-cron] ws=${ws.id} skipped: no expenses for ${year}-${month}`);
        skipped++;
        continue;
      }

      // ── Idempotency check ────────────────────────────────────────────────────
      const inputHash = stableHash({ workspaceId: ws.id, year, month, payload });

      const existing = await prisma.insight.findFirst({
        where: {
          workspaceId: ws.id,
          type: InsightType.RETROSPECTIVE,
          periodYear: year,
          periodMonth: month,
          inputHash,
        },
        select: { id: true },
      });

      if (existing) {
        console.log(
          `[retrospective-cron] ws=${ws.id} skipped: identical insight already exists (id=${existing.id})`
        );
        skipped++;
        continue;
      }

      // ── Build prompt ─────────────────────────────────────────────────────────
      const locale = LOCALE_MAP[ws.language] ?? "en-GB";
      const monthName = localizedMonthName(year, month, locale);

      const { systemPromptExtra, userMessage, tool, schema } =
        buildRetrospectivePrompt({ locale, monthName, year, payload });

      // ── Call GLM (with one retry on InsightParseError) ───────────────────────
      let result = await generateInsight({
        userId: "system-cron",
        bucket: "cron",
        promptType: "retrospective",
        locale,
        systemPromptExtra,
        userMessage,
        tool,
        schema,
        maxTokens: 1024,
      });

      if (result === null) {
        console.error(`[retrospective-cron] ws=${ws.id}: GLM returned null — skipping`);
        skipped++;
        continue;
      }

      // ── Persist ──────────────────────────────────────────────────────────────
      await prisma.insight.create({
        data: {
          workspaceId: ws.id,
          type: InsightType.RETROSPECTIVE,
          status: InsightStatus.OPEN,
          periodYear: year,
          periodMonth: month,
          content: result as object,
          payload: payload as object,
          inputHash,
        },
      });

      console.log(
        `[retrospective-cron] ws=${ws.id}: insight created for ${year}-${String(month).padStart(2, "0")}`
      );
      generated++;
    } catch (err) {
      if (err instanceof InsightParseError) {
        // Retry once
        console.error(
          `[retrospective-cron] ws=${ws.id}: InsightParseError on first attempt — retrying`,
          err.raw
        );
        try {
          const locale = LOCALE_MAP[ws.language] ?? "en-GB";
          const monthName = localizedMonthName(year, month, locale);
          const payload = await aggregateMonth(ws.id, year, month);
          const { systemPromptExtra, userMessage, tool, schema } =
            buildRetrospectivePrompt({ locale, monthName, year, payload });

          const retryResult = await generateInsight({
            userId: "system-cron",
            bucket: "cron",
            promptType: "retrospective",
            locale,
            systemPromptExtra,
            userMessage,
            tool,
            schema,
            maxTokens: 1024,
          });

          if (retryResult === null) {
            console.error(
              `[retrospective-cron] ws=${ws.id}: retry returned null — skipping`
            );
            errors++;
            continue;
          }

          const inputHash = stableHash({ workspaceId: ws.id, year, month, payload });
          await prisma.insight.create({
            data: {
              workspaceId: ws.id,
              type: InsightType.RETROSPECTIVE,
              status: InsightStatus.OPEN,
              periodYear: year,
              periodMonth: month,
              content: retryResult as object,
              payload: payload as object,
              inputHash,
            },
          });

          console.log(`[retrospective-cron] ws=${ws.id}: insight created on retry`);
          generated++;
        } catch (retryErr) {
          console.error(
            `[retrospective-cron] ws=${ws.id}: retry also failed`,
            retryErr
          );
          errors++;
        }
      } else {
        console.error(`[retrospective-cron] ws=${ws.id}: unexpected error`, err);
        errors++;
      }
    }
  }

  console.log(
    `[retrospective-cron] Done — generated=${generated} skipped=${skipped} errors=${errors}`
  );

  return NextResponse.json({ generated, skipped, errors });
}

// Cron setup (server-side, on CT 104):
//   0 2 1 * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://amigo.slendyzo.pt/api/insights/retrospective/generate >> /var/log/amigo-cron.log 2>&1
// Runs at 02:00 UTC on day 1 of every month.
// Set CRON_SECRET in the docker compose env. Without it, the endpoint returns 503.
