/**
 * PATCH /api/insights/dismiss
 *
 * Creates or updates an Insight row with status=DISMISSED and
 * snoozeUntil = now + 7 days. Subsequent fetches in the aggregator
 * and route handlers check snoozeUntil and suppress the candidate.
 */

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { InsightStatus, InsightType } from "@prisma/client";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

type DismissBody =
  | { type: "NUDGE_CATEGORIZE"; scope: Record<string, never> }
  | { type: "NUDGE_KEYWORD"; scope: { merchantKey: string; categoryId: string } }
  | { type: "NUDGE_RECURRING"; scope: { namePrefix8: string } }
  | { type: "NUDGE_PROJECT"; scope: { expenseIds: string[] } };

export async function PATCH(request: Request): Promise<NextResponse> {
  const ctx = await getActiveWorkspace();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = ctx.workspace.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { type, scope } = body as Record<string, unknown>;

  // ── Validate type ──────────────────────────────────────────────────────────
  const validTypes = ["NUDGE_CATEGORIZE", "NUDGE_KEYWORD", "NUDGE_RECURRING", "NUDGE_PROJECT"];
  if (typeof type !== "string" || !validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  if (typeof scope !== "object" || scope === null) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const scopeObj = scope as Record<string, unknown>;

  // ── Validate scope per type & compute inputHash ────────────────────────────
  let inputHash: string;

  if (type === "NUDGE_CATEGORIZE") {
    inputHash = sha256("categorize:workspace");
  } else if (type === "NUDGE_KEYWORD") {
    const { merchantKey, categoryId } = scopeObj;
    if (typeof merchantKey !== "string" || typeof categoryId !== "string") {
      return NextResponse.json(
        { error: "NUDGE_KEYWORD scope requires merchantKey and categoryId strings" },
        { status: 400 }
      );
    }
    inputHash = sha256(`keyword:${merchantKey}:${categoryId}`);
  } else if (type === "NUDGE_RECURRING") {
    const { namePrefix8 } = scopeObj;
    if (
      typeof namePrefix8 !== "string" ||
      namePrefix8.length !== 8 ||
      namePrefix8 !== namePrefix8.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "NUDGE_RECURRING scope requires namePrefix8: exactly 8 lowercase chars" },
        { status: 400 }
      );
    }
    inputHash = sha256(`recurring:${namePrefix8}`);
  } else {
    // NUDGE_PROJECT
    const { expenseIds } = scopeObj;
    if (
      !Array.isArray(expenseIds) ||
      expenseIds.length < 3 ||
      !expenseIds.every((id) => typeof id === "string")
    ) {
      return NextResponse.json(
        { error: "NUDGE_PROJECT scope requires expenseIds: string[] with length >= 3" },
        { status: 400 }
      );
    }

    // Verify all expense IDs belong to this workspace
    const ownedCount = await prisma.expense.count({
      where: { id: { in: expenseIds as string[] }, workspaceId },
    });
    if (ownedCount !== expenseIds.length) {
      return NextResponse.json(
        { error: "One or more expenses not found in workspace" },
        { status: 403 }
      );
    }

    inputHash = sha256(`project:${(expenseIds as string[]).slice().sort().join(",")}`);
  }

  // ── Upsert the dismissed Insight row ──────────────────────────────────────
  const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const existing = await prisma.insight.findFirst({
    where: {
      workspaceId,
      type: type as InsightType,
      inputHash,
      status: { in: [InsightStatus.OPEN, InsightStatus.DISMISSED] },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.insight.update({
      where: { id: existing.id },
      data: {
        status: InsightStatus.DISMISSED,
        dismissedAt: now,
        snoozeUntil,
      },
    });
  } else {
    await prisma.insight.create({
      data: {
        workspaceId,
        type: type as InsightType,
        inputHash,
        status: InsightStatus.DISMISSED,
        dismissedAt: now,
        snoozeUntil,
        payload: {},
        content: {},
      },
    });
  }

  return NextResponse.json({ snoozedUntil: snoozeUntil.toISOString() });
}
